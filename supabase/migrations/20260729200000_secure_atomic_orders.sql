-- Keep customer data private and create each order atomically.
DROP POLICY IF EXISTS "orders_public_read" ON public.orders;
DROP POLICY IF EXISTS "orders_public_insert" ON public.orders;
DROP POLICY IF EXISTS "order_items_public_read" ON public.order_items;
DROP POLICY IF EXISTS "order_items_public_insert" ON public.order_items;

REVOKE SELECT, INSERT ON public.orders FROM anon;
REVOKE SELECT, INSERT ON public.order_items FROM anon;
REVOKE USAGE ON SEQUENCE public.order_number_seq FROM anon;

CREATE POLICY "orders_staff_read"
ON public.orders
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.create_public_order(
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_order_type public.order_type,
  p_notes text,
  p_items jsonb
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
  v_order public.orders%ROWTYPE;
  v_requested_count integer;
  v_available_count integer;
  v_total bigint;
BEGIN
  p_customer_name := btrim(p_customer_name);
  p_customer_phone := btrim(p_customer_phone);
  p_address := nullif(btrim(p_address), '');
  p_notes := nullif(btrim(p_notes), '');

  IF char_length(p_customer_name) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Nome inválido' USING ERRCODE = '22023';
  END IF;
  IF char_length(p_customer_phone) NOT BETWEEN 6 AND 20 THEN
    RAISE EXCEPTION 'Telefone inválido' USING ERRCODE = '22023';
  END IF;
  IF p_order_type = 'entrega' AND (p_address IS NULL OR char_length(p_address) < 3) THEN
    RAISE EXCEPTION 'A morada é obrigatória para entrega' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(p_address, '')) > 300 THEN
    RAISE EXCEPTION 'Morada demasiado longa' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(p_notes, '')) > 500 THEN
    RAISE EXCEPTION 'Notas demasiado longas' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'O pedido deve conter entre 1 e 50 itens' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item
    WHERE jsonb_typeof(item) <> 'object'
      OR NOT item ? 'menu_item_id'
      OR NOT item ? 'quantity'
      OR coalesce(item->>'menu_item_id', '') = ''
      OR coalesce(item->>'quantity', '') !~ '^[0-9]+$'
      OR (item->>'quantity')::integer NOT BETWEEN 1 AND 50
  ) THEN
    RAISE EXCEPTION 'Item do pedido inválido' USING ERRCODE = '22023';
  END IF;

  WITH requested AS (
    SELECT
      (item->>'menu_item_id')::uuid AS menu_item_id,
      sum((item->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) AS item
    GROUP BY (item->>'menu_item_id')::uuid
  )
  SELECT count(*)
  INTO v_requested_count
  FROM requested;

  IF EXISTS (
    WITH requested AS (
      SELECT
        (item->>'menu_item_id')::uuid AS menu_item_id,
        sum((item->>'quantity')::integer)::integer AS quantity
      FROM jsonb_array_elements(p_items) AS item
      GROUP BY (item->>'menu_item_id')::uuid
    )
    SELECT 1 FROM requested WHERE quantity > 50
  ) THEN
    RAISE EXCEPTION 'Quantidade máxima excedida para um item' USING ERRCODE = '22023';
  END IF;

  WITH requested AS (
    SELECT
      (item->>'menu_item_id')::uuid AS menu_item_id,
      sum((item->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) AS item
    GROUP BY (item->>'menu_item_id')::uuid
  )
  SELECT count(*), coalesce(sum(menu.price_cents::bigint * requested.quantity), 0)
  INTO v_available_count, v_total
  FROM requested
  JOIN public.menu_items AS menu
    ON menu.id = requested.menu_item_id
   AND menu.available;

  IF v_available_count <> v_requested_count THEN
    RAISE EXCEPTION 'Um ou mais itens não existem ou estão indisponíveis' USING ERRCODE = '22023';
  END IF;
  IF v_total <= 0 OR v_total > 2147483647 THEN
    RAISE EXCEPTION 'Total do pedido inválido' USING ERRCODE = '22023';
  END IF;

  -- Lock all affected stock rows in a stable order before checking availability.
  PERFORM stock.id
  FROM public.stock_items AS stock
  JOIN (
    WITH requested AS (
      SELECT
        (item->>'menu_item_id')::uuid AS menu_item_id,
        sum((item->>'quantity')::integer)::integer AS quantity
      FROM jsonb_array_elements(p_items) AS item
      GROUP BY (item->>'menu_item_id')::uuid
    )
    SELECT recipe.stock_item_id, sum(recipe.quantity * requested.quantity) AS quantity
    FROM requested
    JOIN public.menu_item_ingredients AS recipe
      ON recipe.menu_item_id = requested.menu_item_id
    GROUP BY recipe.stock_item_id
  ) AS required ON required.stock_item_id = stock.id
  ORDER BY stock.id
  FOR UPDATE OF stock;

  IF EXISTS (
    WITH requested AS (
      SELECT
        (item->>'menu_item_id')::uuid AS menu_item_id,
        sum((item->>'quantity')::integer)::integer AS quantity
      FROM jsonb_array_elements(p_items) AS item
      GROUP BY (item->>'menu_item_id')::uuid
    ),
    required AS (
      SELECT recipe.stock_item_id, sum(recipe.quantity * requested.quantity) AS quantity
      FROM requested
      JOIN public.menu_item_ingredients AS recipe
        ON recipe.menu_item_id = requested.menu_item_id
      GROUP BY recipe.stock_item_id
    )
    SELECT 1
    FROM required
    JOIN public.stock_items AS stock ON stock.id = required.stock_item_id
    WHERE stock.quantity < required.quantity
  ) THEN
    RAISE EXCEPTION 'Stock insuficiente para concluir o pedido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.orders (
    customer_name,
    customer_phone,
    address,
    order_type,
    notes,
    total_cents
  )
  VALUES (
    p_customer_name,
    p_customer_phone,
    CASE WHEN p_order_type = 'entrega' THEN p_address ELSE NULL END,
    p_order_type,
    p_notes,
    v_total::integer
  )
  RETURNING * INTO v_order;

  INSERT INTO public.order_items (
    order_id,
    menu_item_id,
    name_snapshot,
    unit_price_cents,
    quantity
  )
  WITH requested AS (
    SELECT
      (item->>'menu_item_id')::uuid AS menu_item_id,
      sum((item->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) AS item
    GROUP BY (item->>'menu_item_id')::uuid
  )
  SELECT
    v_order.id,
    menu.id,
    menu.name,
    menu.price_cents,
    requested.quantity
  FROM requested
  JOIN public.menu_items AS menu ON menu.id = requested.menu_item_id;

  UPDATE public.stock_items AS stock
  SET quantity = stock.quantity - required.quantity
  FROM (
    WITH requested AS (
      SELECT
        (item->>'menu_item_id')::uuid AS menu_item_id,
        sum((item->>'quantity')::integer)::integer AS quantity
      FROM jsonb_array_elements(p_items) AS item
      GROUP BY (item->>'menu_item_id')::uuid
    )
    SELECT recipe.stock_item_id, sum(recipe.quantity * requested.quantity) AS quantity
    FROM requested
    JOIN public.menu_item_ingredients AS recipe
      ON recipe.menu_item_id = requested.menu_item_id
    GROUP BY recipe.stock_item_id
  ) AS required
  WHERE stock.id = required.stock_item_id;

  RETURN QUERY
  SELECT v_order.id, v_order.order_number, v_order.total_cents, v_order.status;
END;
$$;

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

REVOKE ALL ON FUNCTION public.create_public_order(text, text, text, public.order_type, text, jsonb)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_order(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_public_order(text, text, text, public.order_type, text, jsonb)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_order(uuid) TO anon, authenticated;
