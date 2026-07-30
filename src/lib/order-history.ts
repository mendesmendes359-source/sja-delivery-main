import { useSyncExternalStore } from "react";
import { z } from "zod";

const STORAGE_KEY = "sja-order-history-v1";
const HISTORY_CHANGED_EVENT = "sja-order-history-changed";
const MAX_HISTORY_ENTRIES = 50;

const OrderHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  order_number: z.string().min(1).max(100),
  total_cents: z.number().int().nonnegative(),
  order_type: z.enum(["entrega", "takeaway"]),
  created_at: z.string().min(1),
});

export type OrderHistoryEntry = z.infer<typeof OrderHistoryEntrySchema>;

const EMPTY_HISTORY: OrderHistoryEntry[] = [];
let cachedRaw: string | null | undefined;
let cachedHistory: OrderHistoryEntry[] = EMPTY_HISTORY;

function parseHistory(raw: string | null): OrderHistoryEntry[] {
  if (!raw) return EMPTY_HISTORY;

  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY_HISTORY;

    return value
      .map((entry) => OrderHistoryEntrySchema.safeParse(entry))
      .filter((result) => result.success)
      .map((result) => result.data)
      .slice(0, MAX_HISTORY_ENTRIES);
  } catch {
    return EMPTY_HISTORY;
  }
}

function getHistorySnapshot(): OrderHistoryEntry[] {
  if (typeof window === "undefined") return EMPTY_HISTORY;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedHistory;
    cachedRaw = raw;
    cachedHistory = parseHistory(raw);
    return cachedHistory;
  } catch {
    return EMPTY_HISTORY;
  }
}

function publishHistory(entries: OrderHistoryEntry[]) {
  if (typeof window === "undefined") return;

  try {
    const raw = JSON.stringify(entries);
    window.localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
    cachedHistory = entries;
    window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
  } catch {
    // Browsers may block local storage; order tracking still works via its direct link.
  }
}

function subscribeToHistory(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(HISTORY_CHANGED_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(HISTORY_CHANGED_EVENT, onStoreChange);
  };
}

export function saveOrderHistoryEntry(entry: OrderHistoryEntry) {
  const parsed = OrderHistoryEntrySchema.safeParse(entry);
  if (!parsed.success || typeof window === "undefined") return;

  const current = getHistorySnapshot();
  publishHistory(
    [parsed.data, ...current.filter((saved) => saved.id !== parsed.data.id)].slice(
      0,
      MAX_HISTORY_ENTRIES,
    ),
  );
}

export function removeOrderHistoryEntry(id: string) {
  publishHistory(getHistorySnapshot().filter((entry) => entry.id !== id));
}

export function clearOrderHistory() {
  publishHistory([]);
}

export function useOrderHistory() {
  return useSyncExternalStore(subscribeToHistory, getHistorySnapshot, () => EMPTY_HISTORY);
}
