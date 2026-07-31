import { STATUS_LABEL } from "@/lib/format";

export const ORDER_STATUSES = [
  "pendente",
  "aceite",
  "em_preparacao",
  "saiu_entrega",
  "entregue",
  "cancelado",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderType = "entrega" | "takeaway";

type OrderWorkflow = {
  status: OrderStatus;
  order_type: OrderType;
};

const NEXT_MANUAL_STATUS: Record<OrderType, Partial<Record<OrderStatus, OrderStatus>>> = {
  entrega: {
    pendente: "aceite",
    aceite: "em_preparacao",
  },
  takeaway: {
    pendente: "aceite",
    aceite: "em_preparacao",
    em_preparacao: "entregue",
  },
};

export function getManualStatusOptions(order: OrderWorkflow) {
  const nextStatus = NEXT_MANUAL_STATUS[order.order_type][order.status];
  const statuses: OrderStatus[] = [order.status];

  if (nextStatus) statuses.push(nextStatus);
  if (order.status !== "entregue" && order.status !== "cancelado") statuses.push("cancelado");

  return statuses.map((status) => ({
    value: status,
    label: STATUS_LABEL[status],
  }));
}

export function assertManualOrderTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
  orderType: OrderType,
) {
  if (currentStatus === nextStatus) return;

  if (currentStatus === "entregue" || currentStatus === "cancelado") {
    throw new Error("Um pedido concluído ou cancelado não pode ser reaberto");
  }

  if (nextStatus === "cancelado") return;

  if (orderType === "entrega" && (nextStatus === "saiu_entrega" || nextStatus === "entregue")) {
    throw new Error("A saída e a conclusão devem ser confirmadas no módulo Entregas");
  }

  if (NEXT_MANUAL_STATUS[orderType][currentStatus] !== nextStatus) {
    throw new Error(`Conclua a etapa atual antes de passar para ${STATUS_LABEL[nextStatus]}`);
  }
}

export function getOrderWorkflowGuidance(order: OrderWorkflow) {
  switch (order.status) {
    case "pendente":
      return "Confirme os dados e aceite o pedido antes de iniciar a preparação.";
    case "aceite":
      return "O pedido já foi aceite e pode agora entrar em preparação.";
    case "em_preparacao":
      return order.order_type === "entrega"
        ? "Para avançar, defina o horário, atribua um estafeta e confirme a saída no módulo Entregas."
        : "Marque como entregue apenas depois de concluir a preparação e entregar ao cliente.";
    case "saiu_entrega":
      return "A conclusão deve ser confirmada pelo estafeta ou no módulo Entregas.";
    case "entregue":
      return "Fluxo concluído. Este pedido já não pode mudar de estado.";
    case "cancelado":
      return "Fluxo encerrado por cancelamento. Este pedido já não pode ser reaberto.";
  }
}
