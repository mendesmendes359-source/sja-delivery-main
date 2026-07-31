-- Enforce the order lifecycle in the database so no screen or direct API call
-- can skip required stages.
CREATE OR REPLACE FUNCTION public.enforce_order_status_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery_status text;
  v_has_courier boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('entregue', 'cancelado') THEN
    RAISE EXCEPTION 'Um pedido concluído ou cancelado não pode ser reaberto'
      USING ERRCODE = '22023';
  END IF;

  -- Cancellation is permitted from any active stage. The existing table
  -- constraint still requires a valid cancellation reason.
  IF NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pendente' AND NEW.status = 'aceite' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'aceite' AND NEW.status = 'em_preparacao' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'em_preparacao'
    AND NEW.status = 'entregue'
    AND NEW.order_type = 'takeaway'
  THEN
    RETURN NEW;
  END IF;

  IF NEW.order_type = 'entrega'
    AND OLD.status = 'em_preparacao'
    AND NEW.status = 'saiu_entrega'
  THEN
    SELECT delivery.status, delivery.courier_id IS NOT NULL
    INTO v_delivery_status, v_has_courier
    FROM public.deliveries AS delivery
    WHERE delivery.order_id = NEW.id;

    IF NEW.estimated_delivery_at IS NULL THEN
      RAISE EXCEPTION 'Defina o horário antes de iniciar a entrega'
        USING ERRCODE = '22023';
    END IF;

    IF v_delivery_status IS NULL OR NOT COALESCE(v_has_courier, false) THEN
      RAISE EXCEPTION 'Atribua um estafeta antes de iniciar a entrega'
        USING ERRCODE = '22023';
    END IF;

    IF v_delivery_status <> 'em_transito' THEN
      RAISE EXCEPTION 'Confirme a saída no módulo Entregas'
        USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.order_type = 'entrega'
    AND OLD.status = 'saiu_entrega'
    AND NEW.status = 'entregue'
  THEN
    SELECT delivery.status
    INTO v_delivery_status
    FROM public.deliveries AS delivery
    WHERE delivery.order_id = NEW.id;

    IF v_delivery_status <> 'entregue' THEN
      RAISE EXCEPTION 'Confirme a conclusão no módulo Entregas'
        USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Conclua a etapa atual antes de alterar o estado do pedido'
    USING ERRCODE = '22023';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_status_workflow ON public.orders;
CREATE TRIGGER trg_enforce_order_status_workflow
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_status_workflow();

COMMENT ON FUNCTION public.enforce_order_status_workflow() IS
  'Impede saltos, regressões e reabertura no fluxo de estados dos pedidos.';
