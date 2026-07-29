export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: "AOA",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  aceite: "Aceite",
  em_preparacao: "Em preparação",
  saiu_entrega: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const STATUS_ORDER = [
  "pendente",
  "aceite",
  "em_preparacao",
  "saiu_entrega",
  "entregue",
] as const;
