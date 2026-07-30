CREATE TABLE public.delivery_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  delivery_fee_cents integer NOT NULL DEFAULT 0
    CHECK (delivery_fee_cents BETWEEN 0 AND 100000000),
  default_eta_minutes integer NOT NULL DEFAULT 45
    CHECK (default_eta_minutes BETWEEN 5 AND 1440),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.delivery_settings (id, delivery_fee_cents, default_eta_minutes)
VALUES (true, 0, 45);

GRANT SELECT ON public.delivery_settings TO anon, authenticated;
GRANT UPDATE ON public.delivery_settings TO authenticated;
GRANT ALL ON public.delivery_settings TO service_role;

ALTER TABLE public.delivery_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_settings_public_read"
ON public.delivery_settings
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "delivery_settings_staff_update"
ON public.delivery_settings
FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_delivery_settings_updated
BEFORE UPDATE ON public.delivery_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders
ADD COLUMN subtotal_cents integer NOT NULL DEFAULT 0,
ADD COLUMN delivery_fee_cents integer NOT NULL DEFAULT 0,
ADD COLUMN estimated_delivery_at timestamptz;

UPDATE public.orders
SET subtotal_cents = total_cents;

ALTER TABLE public.orders
ADD CONSTRAINT orders_subtotal_nonnegative
CHECK (subtotal_cents >= 0),
ADD CONSTRAINT orders_delivery_fee_nonnegative
CHECK (delivery_fee_cents >= 0),
ADD CONSTRAINT orders_total_matches_breakdown
CHECK (total_cents = subtotal_cents + delivery_fee_cents),
ADD CONSTRAINT orders_takeaway_has_no_delivery_values
CHECK (
  order_type = 'entrega'
  OR (
    delivery_fee_cents = 0
    AND estimated_delivery_at IS NULL
  )
);

CREATE OR REPLACE FUNCTION public.apply_delivery_pricing_to_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery_fee integer := 0;
  v_eta_minutes integer := 45;
  v_subtotal bigint;
BEGIN
  v_subtotal := CASE
    WHEN NEW.subtotal_cents > 0 THEN NEW.subtotal_cents
    ELSE NEW.total_cents
  END;

  IF v_subtotal < 0 THEN
    RAISE EXCEPTION 'Subtotal do pedido inválido'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.order_type = 'entrega' THEN
    SELECT settings.delivery_fee_cents, settings.default_eta_minutes
    INTO v_delivery_fee, v_eta_minutes
    FROM public.delivery_settings AS settings
    WHERE settings.id = true;

    IF v_subtotal + v_delivery_fee > 2147483647 THEN
      RAISE EXCEPTION 'Total do pedido inválido'
        USING ERRCODE = '22023';
    END IF;

    NEW.delivery_fee_cents := v_delivery_fee;
    NEW.estimated_delivery_at := statement_timestamp() + make_interval(mins => v_eta_minutes);
  ELSE
    NEW.delivery_fee_cents := 0;
    NEW.estimated_delivery_at := NULL;
  END IF;

  NEW.subtotal_cents := v_subtotal::integer;
  NEW.total_cents := (v_subtotal + NEW.delivery_fee_cents)::integer;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_delivery_pricing_to_new_order
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.apply_delivery_pricing_to_new_order();

CREATE OR REPLACE FUNCTION public.get_public_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'order',
    jsonb_build_object(
      'id', orders.id,
      'order_number', orders.order_number,
      'customer_name', orders.customer_name,
      'status', orders.status,
      'cancellation_reason', orders.cancellation_reason,
      'subtotal_cents', orders.subtotal_cents,
      'delivery_fee_cents', orders.delivery_fee_cents,
      'total_cents', orders.total_cents,
      'order_type', orders.order_type,
      'estimated_delivery_at', orders.estimated_delivery_at,
      'address', orders.address,
      'notes', orders.notes,
      'created_at', orders.created_at
    ),
    'items',
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', order_items.id,
            'name_snapshot', order_items.name_snapshot,
            'quantity', order_items.quantity,
            'unit_price_cents', order_items.unit_price_cents
          )
          ORDER BY order_items.id
        )
        FROM public.order_items
        WHERE order_items.order_id = orders.id
      ),
      '[]'::jsonb
    )
  )
  FROM public.orders
  WHERE orders.id = p_order_id
$$;

REVOKE ALL ON FUNCTION public.get_public_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order(uuid) TO anon, authenticated;
