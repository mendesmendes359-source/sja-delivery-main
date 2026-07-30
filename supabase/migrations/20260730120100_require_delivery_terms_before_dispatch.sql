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
      RAISE EXCEPTION 'Defina o preço e a previsão antes de iniciar a entrega'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_require_delivery_terms_before_dispatch
BEFORE UPDATE OF status ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.require_delivery_terms_before_dispatch();
