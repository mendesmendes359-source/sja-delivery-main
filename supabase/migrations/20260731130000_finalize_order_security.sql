REVOKE ALL ON FUNCTION public.create_public_order(
  text, text, text, public.order_type, text, jsonb, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_order(
  text, text, text, public.order_type, text, jsonb, uuid
) TO service_role;

DROP FUNCTION public.get_public_order(uuid);
