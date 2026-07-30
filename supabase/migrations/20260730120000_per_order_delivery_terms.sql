DROP TRIGGER IF EXISTS trg_apply_delivery_pricing_to_new_order ON public.orders;
DROP FUNCTION IF EXISTS public.apply_delivery_pricing_to_new_order();

CREATE OR REPLACE FUNCTION public.initialize_new_order_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subtotal bigint;
BEGIN
  v_subtotal := CASE
    WHEN NEW.subtotal_cents > 0 THEN NEW.subtotal_cents
    ELSE NEW.total_cents
  END;

  IF v_subtotal < 0 OR v_subtotal > 2147483647 THEN
    RAISE EXCEPTION 'Subtotal do pedido inválido'
      USING ERRCODE = '22023';
  END IF;

  NEW.subtotal_cents := v_subtotal::integer;
  NEW.delivery_fee_cents := 0;
  NEW.estimated_delivery_at := NULL;
  NEW.total_cents := v_subtotal::integer;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_initialize_new_order_pricing
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.initialize_new_order_pricing();

CREATE OR REPLACE FUNCTION public.set_order_delivery_terms(
  p_order_id uuid,
  p_delivery_fee_cents integer,
  p_estimated_delivery_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_type public.order_type;
  v_order_status public.order_status;
  v_subtotal integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Não autorizado'
      USING ERRCODE = '42501';
  END IF;

  IF p_delivery_fee_cents IS NULL
    OR p_delivery_fee_cents NOT BETWEEN 0 AND 100000000
  THEN
    RAISE EXCEPTION 'Preço de entrega inválido'
      USING ERRCODE = '22023';
  END IF;

  IF p_estimated_delivery_at IS NULL
    OR p_estimated_delivery_at <= statement_timestamp()
    OR p_estimated_delivery_at > statement_timestamp() + interval '7 days'
  THEN
    RAISE EXCEPTION 'A previsão deve ser futura e não pode exceder 7 dias'
      USING ERRCODE = '22023';
  END IF;

  SELECT order_type, status, subtotal_cents
  INTO v_order_type, v_order_status, v_subtotal
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
    RAISE EXCEPTION 'Não é possível alterar uma entrega concluída ou cancelada'
      USING ERRCODE = '22023';
  END IF;

  IF v_subtotal::bigint + p_delivery_fee_cents > 2147483647 THEN
    RAISE EXCEPTION 'Total do pedido inválido'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET
    delivery_fee_cents = p_delivery_fee_cents,
    total_cents = v_subtotal + p_delivery_fee_cents,
    estimated_delivery_at = p_estimated_delivery_at
  WHERE id = p_order_id;

  RETURN p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_delivery_terms(uuid, integer, timestamptz)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_delivery_terms(uuid, integer, timestamptz)
TO authenticated;

DROP TABLE public.delivery_settings;
