ALTER TABLE public.orders
ADD COLUMN cancellation_reason text;

UPDATE public.orders
SET cancellation_reason = 'Motivo não registado'
WHERE status = 'cancelado';

ALTER TABLE public.orders
ADD CONSTRAINT orders_cancellation_reason_matches_status
CHECK (
  (
    status = 'cancelado'
    AND cancellation_reason IS NOT NULL
    AND char_length(btrim(cancellation_reason)) BETWEEN 3 AND 500
  )
  OR
  (
    status <> 'cancelado'
    AND cancellation_reason IS NULL
  )
);

COMMENT ON COLUMN public.orders.cancellation_reason IS
  'Motivo obrigatório quando o pedido está cancelado; nulo nos restantes estados.';

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
      'total_cents', orders.total_cents,
      'order_type', orders.order_type,
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
