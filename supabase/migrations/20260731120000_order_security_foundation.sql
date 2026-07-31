CREATE TABLE public.order_rate_limits (
  scope text NOT NULL CHECK (scope IN ('ip', 'phone')),
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, subject_hash, window_started_at)
);

CREATE INDEX order_rate_limits_window_idx
ON public.order_rate_limits (window_started_at);

ALTER TABLE public.order_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_order_rate_limit(
  p_ip_hash text,
  p_phone_hash text
)
RETURNS TABLE (
  allowed boolean,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window_started_at timestamptz := date_bin(
    interval '15 minutes',
    now(),
    timestamptz '2000-01-01 00:00:00+00'
  );
  v_ip_count integer;
  v_phone_count integer;
BEGIN
  IF p_ip_hash !~ '^[0-9a-f]{64}$'
    OR p_phone_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Identificador de limite inválido'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.order_rate_limits AS limits (
    scope,
    subject_hash,
    window_started_at,
    request_count
  )
  VALUES ('ip', p_ip_hash, v_window_started_at, 1)
  ON CONFLICT (scope, subject_hash, window_started_at)
  DO UPDATE SET
    request_count = limits.request_count + 1,
    updated_at = now()
  RETURNING request_count INTO v_ip_count;

  INSERT INTO public.order_rate_limits AS limits (
    scope,
    subject_hash,
    window_started_at,
    request_count
  )
  VALUES ('phone', p_phone_hash, v_window_started_at, 1)
  ON CONFLICT (scope, subject_hash, window_started_at)
  DO UPDATE SET
    request_count = limits.request_count + 1,
    updated_at = now()
  RETURNING request_count INTO v_phone_count;

  DELETE FROM public.order_rate_limits
  WHERE window_started_at < v_window_started_at - interval '1 day';

  RETURN QUERY
  SELECT
    v_ip_count <= 20 AND v_phone_count <= 5,
    CASE
      WHEN v_ip_count > 20 OR v_phone_count > 5
      THEN greatest(
        1,
        ceil(extract(epoch FROM (v_window_started_at + interval '15 minutes' - now())))::integer
      )
      ELSE 0
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_order_rate_limit(text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_rate_limit(text, text)
TO service_role;

ALTER TABLE public.orders
ADD COLUMN tracking_token_hash text,
ADD COLUMN tracking_expires_at timestamptz;

UPDATE public.orders
SET tracking_expires_at = now()
WHERE tracking_expires_at IS NULL;

ALTER TABLE public.orders
ALTER COLUMN tracking_expires_at SET DEFAULT (now() + interval '30 days'),
ALTER COLUMN tracking_expires_at SET NOT NULL;

ALTER TABLE public.orders
ADD CONSTRAINT orders_tracking_token_hash_valid
CHECK (
  tracking_token_hash IS NULL
  OR tracking_token_hash ~ '^[0-9a-f]{64}$'
);

DROP FUNCTION public.create_public_order(
  text, text, text, public.order_type, text, jsonb, uuid
);

CREATE FUNCTION public.create_public_order(
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
  status public.order_status,
  tracking_token text,
  tracking_expires_at timestamptz
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
  v_tracking_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_tracking_expires_at timestamptz := now() + interval '30 days';
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

    v_created.total_cents := v_total::integer;
  END IF;

  UPDATE public.orders
  SET
    delivery_zone_id = p_delivery_zone_id,
    delivery_zone_name = CASE WHEN p_order_type = 'entrega' THEN v_zone_name ELSE NULL END,
    delivery_fee_cents = CASE WHEN p_order_type = 'entrega' THEN v_delivery_fee ELSE 0 END,
    total_cents = v_created.total_cents,
    tracking_token_hash = encode(
      extensions.digest(convert_to(v_tracking_token, 'UTF8'), 'sha256'),
      'hex'
    ),
    tracking_expires_at = v_tracking_expires_at
  WHERE orders.id = v_created.id;

  RETURN QUERY
  SELECT
    v_created.id::uuid,
    v_created.order_number::text,
    v_created.total_cents::integer,
    v_created.status::public.order_status,
    v_tracking_token,
    v_tracking_expires_at;
END;
$$;

-- Kept temporarily for the currently deployed checkout. A follow-up migration
-- revokes anonymous execution after the token-aware application is deployed.
REVOKE ALL ON FUNCTION public.create_public_order(
  text, text, text, public.order_type, text, jsonb, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(
  text, text, text, public.order_type, text, jsonb, uuid
) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_order(
  p_order_id uuid,
  p_tracking_token text
)
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
      'status', orders.status,
      'cancellation_reason', orders.cancellation_reason,
      'subtotal_cents', orders.subtotal_cents,
      'delivery_fee_cents', orders.delivery_fee_cents,
      'total_cents', orders.total_cents,
      'order_type', orders.order_type,
      'estimated_delivery_at', orders.estimated_delivery_at,
      'tracking_expires_at', orders.tracking_expires_at,
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
    AND orders.tracking_expires_at > now()
    AND orders.tracking_token_hash IS NOT NULL
    AND p_tracking_token ~ '^[0-9a-f]{64}$'
    AND orders.tracking_token_hash = encode(
      extensions.digest(convert_to(p_tracking_token, 'UTF8'), 'sha256'),
      'hex'
    )
$$;

REVOKE ALL ON FUNCTION public.get_public_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order(uuid, text)
TO anon, authenticated;
