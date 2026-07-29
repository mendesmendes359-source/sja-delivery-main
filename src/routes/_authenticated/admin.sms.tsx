import { createFileRoute } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BellRing, CircleCheck, CircleX, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { RouteLoaderArgs } from "@/router-context";
import {
  getSmsProviderStatus,
  saveNotificationSettings,
  sendManualSms,
} from "@/lib/orders.functions";
import { formatDate, STATUS_LABEL } from "@/lib/format";
import {
  NOTIFICATION_SETTINGS_PHONE,
  parseNotificationSettings,
  parseSmsLogMetadata,
} from "@/lib/sms-log";

const smsQO = queryOptions({
  queryKey: ["admin", "sms"],
  queryFn: async () => {
    const [logs, settings] = await Promise.all([
      supabase
        .from("sms_logs")
        .select("*")
        .neq("to_phone", NOTIFICATION_SETTINGS_PHONE)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("sms_logs")
        .select("body")
        .eq("to_phone", NOTIFICATION_SETTINGS_PHONE)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (logs.error) throw logs.error;
    if (settings.error) throw settings.error;
    return {
      logs: logs.data ?? [],
      settings: parseNotificationSettings(settings.data?.body),
    };
  },
});

export const Route = createFileRoute("/_authenticated/admin/sms")({
  loader: ({ context }: RouteLoaderArgs) => context.queryClient.ensureQueryData(smsQO),
  component: SmsPage,
});

const RECIPIENT_LABEL: Record<string, string> = {
  customer: "Cliente",
  admin: "Administrador",
  manual: "Manual",
};

function eventLabel(event: string) {
  return STATUS_LABEL[event] ?? (event === "manual" ? "Manual" : event);
}

function SmsPage() {
  const { data } = useSuspenseQuery(smsQO);
  const qc = useQueryClient();
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [adminPhone, setAdminPhone] = useState(data.settings.admin_phone ?? "");
  const [notifyCustomer, setNotifyCustomer] = useState(data.settings.notify_customer);
  const [notifyAdmin, setNotifyAdmin] = useState(data.settings.notify_admin);
  const sendFn = useServerFn(sendManualSms);
  const saveSettingsFn = useServerFn(saveNotificationSettings);
  const providerStatusFn = useServerFn(getSmsProviderStatus);
  const providerStatus = useQuery({
    queryKey: ["admin", "sms", "provider-status"],
    queryFn: () => providerStatusFn(),
  });

  const send = useMutation({
    mutationFn: () => sendFn({ data: { to, body } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["admin", "sms"] });
      if (result.skipped) {
        toast.warning("Twilio não configurado — SMS registado, mas não enviado");
      } else if (result.ok) {
        toast.success("SMS enviado");
      } else {
        toast.error(result.error ?? "Falha");
      }
      setTo("");
      setBody("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      saveSettingsFn({
        data: {
          admin_phone: adminPhone.trim() || null,
          notify_customer: notifyCustomer,
          notify_admin: notifyAdmin,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sms"] });
      toast.success("Notificações atualizadas");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">SMS</h1>
        <p className="text-sm text-muted-foreground">
          Notificações automáticas, histórico e envio manual
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Últimas mensagens</h2>
            <p className="text-xs text-muted-foreground">Até 100 registos mais recentes</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Destinatário</th>
                  <th className="px-4 py-2">Fase</th>
                  <th className="px-4 py-2">Mensagem</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.logs.map((sms) => {
                  const metadata = parseSmsLogMetadata(
                    sms.provider_message_id,
                    Boolean(sms.order_id),
                  );
                  return (
                    <tr key={sms.id}>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                        {formatDate(sms.created_at)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-xs font-medium">
                          {RECIPIENT_LABEL[metadata.recipient_type] ?? metadata.recipient_type}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {sms.to_phone}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">{eventLabel(metadata.event)}</td>
                      <td className="max-w-md px-4 py-2 text-xs">{sms.body}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            sms.status === "sent"
                              ? "bg-emerald-100 text-emerald-700"
                              : sms.status === "skipped"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-brand/15 text-brand"
                          }`}
                        >
                          {sms.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {data.logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      Sem histórico
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5">
            <div className="flex items-start gap-3">
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                  providerStatus.data?.configured
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {providerStatus.data?.configured ? (
                  <CircleCheck className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <CircleX className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <div>
                <h2 className="font-semibold">Ligação à Twilio</h2>
                {providerStatus.isPending ? (
                  <p className="text-xs text-muted-foreground">A verificar configuração…</p>
                ) : providerStatus.data?.configured ? (
                  <p className="text-xs text-emerald-700">
                    Configurada por{" "}
                    {providerStatus.data.authMode === "api_key" ? "API Key" : "Auth Token"} e{" "}
                    {providerStatus.data.senderMode === "messaging_service"
                      ? "Messaging Service"
                      : "número Twilio"}
                    .
                  </p>
                ) : (
                  <div className="space-y-1 text-xs text-amber-800">
                    <p>O envio está inativo.</p>
                    {(providerStatus.data?.issues ?? []).map((issue) => (
                      <p key={issue}>• {issue}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-brand">
                <BellRing className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold">Notificações automáticas</h2>
                <p className="text-xs text-muted-foreground">
                  Enviadas em todas as mudanças de fase do pedido.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-sm">
                Número do administrador
                <input
                  type="tel"
                  value={adminPhone}
                  onChange={(event) => setAdminPhone(event.target.value)}
                  placeholder="+244 9XX XXX XXX"
                  className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
                <span>
                  <strong className="block">Notificar cliente</strong>
                  <span className="text-xs text-muted-foreground">Receção e todas as fases</span>
                </span>
                <input
                  type="checkbox"
                  checked={notifyCustomer}
                  onChange={(event) => setNotifyCustomer(event.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
                <span>
                  <strong className="block">Notificar administrador</strong>
                  <span className="text-xs text-muted-foreground">Novo pedido e mudanças</span>
                </span>
                <input
                  type="checkbox"
                  checked={notifyAdmin}
                  onChange={(event) => setNotifyAdmin(event.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              {notifyAdmin && !adminPhone.trim() ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Introduza o número do administrador para ativar estes avisos.
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => saveSettings.mutate()}
                disabled={saveSettings.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-navy-foreground disabled:opacity-50"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {saveSettings.isPending ? "A guardar..." : "Guardar definições"}
              </button>

              <p className="text-xs text-muted-foreground">
                O envio real requer as credenciais Twilio no ambiente. Sem elas, a tentativa fica
                registada como <code>skipped</code>.
              </p>
            </div>
          </section>

          <form
            className="rounded-xl border bg-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (to && body) send.mutate();
            }}
          >
            <h2 className="font-semibold">Enviar SMS manual</h2>
            <div className="mt-3 space-y-3">
              <input
                type="tel"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="+244 9XX XXX XXX"
                className="w-full rounded border bg-background px-3 py-2 text-sm"
              />
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Mensagem"
                maxLength={500}
                className="min-h-[100px] w-full rounded border bg-background px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={!to || !body || send.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {send.isPending ? "A enviar..." : "Enviar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
