const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const APP_URL = "http://127.0.0.1:8080";
const testStartedAt = new Date().toISOString();
const supabase = createClient(process.env.SJA_SUPABASE_URL, process.env.SJA_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let browser;
let page;
let originalOrder;
const result = {
  viewport: "390x844",
  compactCards: 0,
  desktopTableHidden: false,
  dialogOpened: false,
  phoneLinkVisible: false,
  statusChanged: false,
  consoleErrors: [],
  failedResponses: [],
};

async function authenticateIfNeeded() {
  await page.goto(`${APP_URL}/admin/pedidos`, { waitUntil: "networkidle" });
  if (!page.url().includes("/auth")) return;
  await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL);
  await page.getByLabel("Senha").fill(process.env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin/);
  await page.goto(`${APP_URL}/admin/pedidos`, { waitUntil: "networkidle" });
}

async function cleanup() {
  if (!originalOrder) return;
  const { data: logs } = await supabase
    .from("sms_logs")
    .select("id")
    .eq("order_id", originalOrder.id)
    .gte("created_at", testStartedAt);
  if (logs?.length) await supabase.from("sms_logs").delete().in("id", logs.map((log) => log.id));
  await supabase.from("orders").update({ status: originalOrder.status }).eq("id", originalOrder.id);
}

(async () => {
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
    page = await browser.contexts()[0].newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    page.on("console", (message) => {
      if (message.type() === "error") result.consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        result.failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await authenticateIfNeeded();

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, order_number, customer_phone, status")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !order) throw new Error(error?.message ?? "Nenhum pedido disponível");
    originalOrder = order;

    const cards = page.getByRole("button", { name: /^Ver detalhes do pedido / });
    result.compactCards = await cards.count();
    result.desktopTableHidden = !(await page.locator("table").isVisible());

    await page.getByRole("button", { name: `Ver detalhes do pedido ${order.order_number}` }).click();
    const dialog = page.getByRole("dialog");
    result.dialogOpened = await dialog.isVisible();
    result.phoneLinkVisible = await dialog.locator(`a[href="tel:${order.customer_phone}"]`).isVisible();

    const statuses = [
      "pendente",
      "aceite",
      "em_preparacao",
      "saiu_entrega",
      "entregue",
      "cancelado",
    ];
    const nextStatus = statuses.find((status) => status !== order.status);
    await dialog.getByLabel("Estado do pedido").selectOption(nextStatus);
    await page.getByText("Estado atualizado").waitFor();
    await dialog.getByText(`Estado atual:`, { exact: false }).waitFor();

    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .select("status")
      .eq("id", order.id)
      .single();
    if (updateError) throw updateError;
    result.statusChanged = updated.status === nextStatus;

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
    if (page) await page.close();
    if (browser) await browser.close();
  }
})();
