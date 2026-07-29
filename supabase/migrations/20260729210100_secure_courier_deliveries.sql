ALTER TABLE public.deliveries
ADD COLUMN courier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX deliveries_courier_id_idx
ON public.deliveries (courier_id);

ALTER TABLE public.deliveries
ADD CONSTRAINT deliveries_status_check
CHECK (status IN ('atribuido', 'em_transito', 'entregue'));

CREATE OR REPLACE FUNCTION public.is_courier(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'estafeta'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_courier(_user_id uuid, _order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deliveries
    WHERE courier_id = _user_id
      AND order_id = _order_id
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_courier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_assigned_courier(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_courier(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_assigned_courier(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "deliveries_courier_read"
ON public.deliveries
FOR SELECT
TO authenticated
USING (
  courier_id = auth.uid()
  AND public.is_courier(auth.uid())
);

CREATE POLICY "orders_courier_read"
ON public.orders
FOR SELECT
TO authenticated
USING (
  public.is_courier(auth.uid())
  AND public.is_assigned_courier(auth.uid(), id)
);

CREATE OR REPLACE FUNCTION public.validate_delivery_courier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.courier_id IS NOT NULL
    AND NOT public.is_courier(NEW.courier_id)
  THEN
    RAISE EXCEPTION 'O utilizador selecionado não é estafeta'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_delivery_courier
BEFORE INSERT OR UPDATE OF courier_id
ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.validate_delivery_courier();

CREATE OR REPLACE FUNCTION public.list_couriers()
RETURNS TABLE (
  user_id uuid,
  display_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Não autorizado'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    roles.user_id,
    COALESCE(
      NULLIF(BTRIM(users.raw_user_meta_data ->> 'full_name'), ''),
      users.email,
      'Estafeta'
    )::text
  FROM public.user_roles AS roles
  JOIN auth.users AS users
    ON users.id = roles.user_id
  WHERE roles.role = 'estafeta'
    AND (users.banned_until IS NULL OR users.banned_until <= now())
  ORDER BY 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_delivery(
  p_order_id uuid,
  p_courier_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_courier_name text;
  v_delivery_id uuid;
  v_order_status public.order_status;
  v_order_type public.order_type;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Não autorizado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_courier(p_courier_id) THEN
    RAISE EXCEPTION 'O utilizador selecionado não é estafeta'
      USING ERRCODE = '22023';
  END IF;

  SELECT status, order_type
  INTO v_order_status, v_order_type
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_order_type <> 'entrega' THEN
    RAISE EXCEPTION 'Este pedido não é uma entrega'
      USING ERRCODE = '22023';
  END IF;

  IF v_order_status IN ('entregue', 'cancelado') THEN
    RAISE EXCEPTION 'Não é possível atribuir uma entrega concluída ou cancelada'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    NULLIF(BTRIM(raw_user_meta_data ->> 'full_name'), ''),
    email,
    'Estafeta'
  )
  INTO v_courier_name
  FROM auth.users
  WHERE id = p_courier_id
    AND (banned_until IS NULL OR banned_until <= now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A conta do estafeta está desativada ou não existe'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.deliveries (
    order_id,
    courier_id,
    courier_name,
    status
  )
  VALUES (
    p_order_id,
    p_courier_id,
    v_courier_name,
    'atribuido'
  )
  ON CONFLICT (order_id)
  DO UPDATE SET
    courier_id = EXCLUDED.courier_id,
    courier_name = EXCLUDED.courier_name
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_delivery_status(
  p_delivery_id uuid,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_courier_id uuid;
  v_delivery_status text;
  v_order_status public.order_status;
  v_is_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autorizado'
      USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('em_transito', 'entregue') THEN
    RAISE EXCEPTION 'Estado de entrega inválido'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    delivery.order_id,
    delivery.courier_id,
    delivery.status,
    orders.status
  INTO
    v_order_id,
    v_courier_id,
    v_delivery_status,
    v_order_status
  FROM public.deliveries AS delivery
  JOIN public.orders AS orders
    ON orders.id = delivery.order_id
  WHERE delivery.id = p_delivery_id
  FOR UPDATE OF delivery, orders;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega não encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  v_is_staff := public.is_staff(auth.uid());

  IF NOT v_is_staff
    AND (
      NOT public.is_courier(auth.uid())
      OR v_courier_id IS DISTINCT FROM auth.uid()
    )
  THEN
    RAISE EXCEPTION 'Esta entrega não lhe foi atribuída'
      USING ERRCODE = '42501';
  END IF;

  IF v_order_status = 'cancelado' THEN
    RAISE EXCEPTION 'O pedido foi cancelado'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = v_delivery_status THEN
    RETURN v_order_id;
  END IF;

  IF p_status = 'em_transito' AND v_delivery_status <> 'atribuido' THEN
    RAISE EXCEPTION 'A entrega já saiu ou foi concluída'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'entregue' AND v_delivery_status <> 'em_transito' THEN
    RAISE EXCEPTION 'Marque primeiro a saída para entrega'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'em_transito' THEN
    UPDATE public.deliveries
    SET
      status = 'em_transito',
      dispatched_at = COALESCE(dispatched_at, now())
    WHERE id = p_delivery_id;

    UPDATE public.orders
    SET status = 'saiu_entrega'
    WHERE id = v_order_id;
  ELSE
    UPDATE public.deliveries
    SET
      status = 'entregue',
      delivered_at = COALESCE(delivered_at, now())
    WHERE id = p_delivery_id;

    UPDATE public.orders
    SET status = 'entregue'
    WHERE id = v_order_id;
  END IF;

  RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_couriers() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_delivery(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_delivery_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_couriers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_delivery(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_delivery_status(uuid, text) TO authenticated, service_role;
