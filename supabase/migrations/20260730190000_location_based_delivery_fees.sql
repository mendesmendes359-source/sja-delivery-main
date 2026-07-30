CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  fee_cents integer NOT NULL DEFAULT 0
    CHECK (fee_cents BETWEEN 0 AND 100000000),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_zones_name_valid
    CHECK (char_length(name) BETWEEN 2 AND 100 AND name = btrim(name))
);

CREATE UNIQUE INDEX delivery_zones_name_unique
ON public.delivery_zones (lower(name));

CREATE INDEX delivery_zones_active_sort
ON public.delivery_zones (active, sort_order, name);

CREATE TRIGGER trg_delivery_zones_updated
BEFORE UPDATE ON public.delivery_zones
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_zones_public_read_active"
ON public.delivery_zones
FOR SELECT
TO anon, authenticated
USING (active OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "delivery_zones_admin_insert"
ON public.delivery_zones
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "delivery_zones_admin_update"
ON public.delivery_zones
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "delivery_zones_admin_delete"
ON public.delivery_zones
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.delivery_zones TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;
GRANT ALL ON public.delivery_zones TO service_role;

INSERT INTO public.delivery_zones (name, fee_cents, active, sort_order)
VALUES ('Samba', 0, true, 0);

ALTER TABLE public.orders
ADD COLUMN delivery_zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
ADD COLUMN delivery_zone_name text;

ALTER TABLE public.orders
ADD CONSTRAINT orders_takeaway_has_no_delivery_zone
CHECK (
  order_type = 'entrega'
  OR (delivery_zone_id IS NULL AND delivery_zone_name IS NULL)
);

CREATE INDEX orders_delivery_zone_id_idx
ON public.orders (delivery_zone_id)
WHERE delivery_zone_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_public_order(
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_order_type public.order_type,
  p_notes text,
  p_items jsonb,
  p_delivery_zone_id uuid
)
RETURNS TABLE (
  id uuid,
  order_number text,
  total_cents integer,
  status public.order_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_created record;
  v_zone_name text;
  v_delivery_fee integer := 0;
  v_total bigint;
BEGIN
  IF p_order_type = 'entrega' THEN
    IF p_delivery_zone_id IS NULL THEN
      RAISE EXCEPTION 'Selecione a sua localização de entrega'
        USING ERRCODE = '22023';
    END IF;

    SELECT zone.name, zone.fee_cents
    INTO v_zone_name, v_delivery_fee
    FROM public.delivery_zones AS zone
    WHERE zone.id = p_delivery_zone_id
      AND zone.active
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A localização selecionada não está disponível'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    p_delivery_zone_id := NULL;
  END IF;

  SELECT created.id, created.order_number, created.total_cents, created.status
  INTO v_created
  FROM public.create_public_order(
    p_customer_name,
    p_customer_phone,
    p_address,
    p_order_type,
    p_notes,
    p_items
  ) AS created;

  IF p_order_type = 'entrega' THEN
    v_total := v_created.total_cents::bigint + v_delivery_fee;
    IF v_total > 2147483647 THEN
      RAISE EXCEPTION 'Total do pedido inválido'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.orders
    SET
      delivery_zone_id = p_delivery_zone_id,
      delivery_zone_name = v_zone_name,
      delivery_fee_cents = v_delivery_fee,
      total_cents = v_total::integer
    WHERE orders.id = v_created.id;

    v_created.total_cents := v_total::integer;
  END IF;

  RETURN QUERY
  SELECT
    v_created.id::uuid,
    v_created.order_number::text,
    v_created.total_cents::integer,
    v_created.status::public.order_status;
END;
$$;

-- The six-argument function remains an internal implementation detail so a
-- public caller cannot bypass the configured delivery location and price.
REVOKE ALL ON FUNCTION public.create_public_order(
  text, text, text, public.order_type, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_public_order(
  text, text, text, public.order_type, text, jsonb
) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.create_public_order(
  text, text, text, public.order_type, text, jsonb, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(
  text, text, text, public.order_type, text, jsonb, uuid
) TO anon, authenticated;

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
      'delivery_zone_name', orders.delivery_zone_name,
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
