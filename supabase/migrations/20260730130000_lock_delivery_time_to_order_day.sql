-- Preserve the selected local time while moving every existing estimate to the
-- calendar day on which its order was created in Angola.
UPDATE public.orders
SET estimated_delivery_at =
  (
    (created_at AT TIME ZONE 'Africa/Luanda')::date
    + (estimated_delivery_at AT TIME ZONE 'Africa/Luanda')::time
  ) AT TIME ZONE 'Africa/Luanda'
WHERE order_type = 'entrega'
  AND estimated_delivery_at IS NOT NULL
  AND (estimated_delivery_at AT TIME ZONE 'Africa/Luanda')::date
    IS DISTINCT FROM (created_at AT TIME ZONE 'Africa/Luanda')::date;

CREATE OR REPLACE FUNCTION public.enforce_delivery_schedule_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.estimated_delivery_at IS NOT NULL
    AND NEW.estimated_delivery_at IS DISTINCT FROM OLD.estimated_delivery_at
  THEN
    RAISE EXCEPTION 'O horário da entrega já foi definido e não pode ser alterado'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.estimated_delivery_at IS NOT NULL
    AND (
      NEW.order_type <> 'entrega'
      OR (NEW.estimated_delivery_at AT TIME ZONE 'Africa/Luanda')::date
        IS DISTINCT FROM (NEW.created_at AT TIME ZONE 'Africa/Luanda')::date
    )
  THEN
    RAISE EXCEPTION 'A entrega deve ocorrer na mesma data em que o pedido foi feito'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_delivery_schedule_rules ON public.orders;
CREATE TRIGGER trg_enforce_delivery_schedule_rules
BEFORE UPDATE OF estimated_delivery_at ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_delivery_schedule_rules();

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
  v_created_at timestamptz;
  v_existing_estimate timestamptz;
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

  IF p_estimated_delivery_at IS NULL THEN
    RAISE EXCEPTION 'Indique o horário da entrega'
      USING ERRCODE = '22023';
  END IF;

  SELECT order_type, status, subtotal_cents, created_at, estimated_delivery_at
  INTO v_order_type, v_order_status, v_subtotal, v_created_at, v_existing_estimate
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

  IF (p_estimated_delivery_at AT TIME ZONE 'Africa/Luanda')::date
    IS DISTINCT FROM (v_created_at AT TIME ZONE 'Africa/Luanda')::date
  THEN
    RAISE EXCEPTION 'A entrega deve ocorrer na mesma data em que o pedido foi feito'
      USING ERRCODE = '22023';
  END IF;

  IF v_existing_estimate IS NOT NULL
    AND p_estimated_delivery_at IS DISTINCT FROM v_existing_estimate
  THEN
    RAISE EXCEPTION 'O horário da entrega já foi definido e não pode ser alterado'
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
    estimated_delivery_at = COALESCE(v_existing_estimate, p_estimated_delivery_at)
  WHERE id = p_order_id;

  RETURN p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_delivery_terms(uuid, integer, timestamptz)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_delivery_terms(uuid, integer, timestamptz)
TO authenticated;

CREATE OR REPLACE FUNCTION public.require_delivery_terms_before_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_estimated_delivery_at timestamptz;
BEGIN
  IF NEW.status = 'em_transito'
    AND OLD.status IS DISTINCT FROM NEW.status
  THEN
    SELECT orders.estimated_delivery_at
    INTO v_estimated_delivery_at
    FROM public.orders
    WHERE orders.id = NEW.order_id;

    IF v_estimated_delivery_at IS NULL THEN
      RAISE EXCEPTION 'Defina o preço e o horário antes de iniciar a entrega'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
