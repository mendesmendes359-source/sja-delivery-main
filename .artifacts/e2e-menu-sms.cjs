const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const APP_URL = "http://127.0.0.1:8080";
const TEST_PRODUCT = `Produto teste upload ${Date.now()}`;
const SETTINGS_PHONE = "__sja_notification_settings__";
const testStartedAt = new Date().toISOString();

const supabase = createClient(process.env.SJA_SUPABASE_URL, process.env.SJA_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let browser;
let page;
let createdItem;
let originalOrder;
const createdSmsLogIds = [];
const observations = {
  menuRowsBefore: 0,
  menuRowsAfter: 0,
  uploadedImageUrl: null,
  frontofficeVisible: false,
  categoryEditorOpened: false,
  notificationRecipients: [],
  notificationEvent: null,
  consoleErrors: [],
  pageErrors: [],
  failedResponses: [],
};

async function authenticateIfNeeded() {
  await page.goto(`${APP_URL}/admin/menu`, { waitUntil: "networkidle" });
  if (!page.url().includes("/auth")) return;

  await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL);
  await page.getByLabel("Senha").fill(process.env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin/);
  await page.goto(`${APP_URL}/admin/menu`, { waitUntil: "networkidle" });
}

async function saveTemporaryNotificationSettings() {
  await page.goto(`${APP_URL}/admin/sms`, { waitUntil: "networkidle" });
  await page.getByLabel("Número do administrador").fill("+244900000000");

  for (const label of ["Notificar cliente", "Notificar administrador"]) {
    const checkbox = page.locator("label").filter({ hasText: label }).locator('input[type="checkbox"]');
    if (!(await checkbox.isChecked())) await checkbox.check();
  }

  await page.getByRole("button", { name: "Guardar definições" }).click();
  await page.getByText("Notificações atualizadas").waitFor();
}

async function exerciseAutomaticNotifications() {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_number, status")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !order) throw new Error(error?.message ?? "Nenhum pedido disponível para teste");
  originalOrder = order;

  const statuses = [
    "pendente",
    "aceite",
    "em_preparacao",
    "saiu_entrega",
    "entregue",
    "cancelado",
  ];
  const nextStatus = statuses.find((status) => status !== order.status);

  await page.goto(`${APP_URL}/admin/pedidos`, { waitUntil: "networkidle" });
  const row = page.locator("tbody tr").filter({ hasText: order.order_number });
  await row.locator("select").selectOption(nextStatus);
  await page.getByText("Estado atualizado").waitFor();

  let logs = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await supabase
      .from("sms_logs")
      .select("id, provider_message_id, status, to_phone")
      .eq("order_id", order.id)
      .gte("created_at", testStartedAt);
    if (result.error) throw result.error;
    logs = result.data ?? [];
    if (logs.length >= 2) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (logs.length < 2) throw new Error(`Esperava 2 registos SMS, encontrou ${logs.length}`);

  for (const log of logs) {
    createdSmsLogIds.push(log.id);
    const metadata = JSON.parse(log.provider_message_id);
    observations.notificationRecipients.push(metadata.recipient_type);
    observations.notificationEvent = metadata.event;
    if (log.status !== "skipped") {
      throw new Error(`Estado SMS inesperado sem Twilio: ${log.status}`);
    }
  }
  observations.notificationRecipients.sort();
}

async function exerciseMenuEditor() {
  observations.menuRowsBefore = await page.locator("tbody tr").count();

  await page.getByRole("button", { name: "Novo produto" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo produto" });
  await dialog.getByLabel("Nome").fill(TEST_PRODUCT);
  await dialog.getByLabel("Descrição").fill("Produto temporário para validar o editor e a imagem.");
  await dialog.getByLabel("Preço (Kz)").fill("1234");
  await dialog.locator('input[type="file"]').setInputFiles(
    "C:\\Users\\Jairo\\Downloads\\sja-delivery-main\\public\\images\\menu\\classic-burger.jpg",
  );
  await dialog.locator('img[src^="data:image/"]').waitFor();
  await dialog.getByRole("button", { name: "Guardar produto" }).click();
  await page.getByText("Produto guardado").waitFor();
  await page.getByText(TEST_PRODUCT, { exact: true }).waitFor();

  const result = await supabase
    .from("menu_items")
    .select("id, image_url")
    .eq("name", TEST_PRODUCT)
    .single();
  if (result.error || !result.data?.image_url) {
    throw new Error(result.error?.message ?? "Produto sem imagem persistida");
  }
  createdItem = result.data;
  observations.uploadedImageUrl = result.data.image_url;
  observations.menuRowsAfter = await page.locator("tbody tr").count();

  await page.goto(`${APP_URL}/menu`, { waitUntil: "networkidle" });
  observations.frontofficeVisible = await page.getByText(TEST_PRODUCT, { exact: true }).isVisible();

  await page.goto(`${APP_URL}/admin/menu`, { waitUntil: "networkidle" });
  const categoryEditButton = page.getByRole("button", { name: /^Editar categoria / }).first();
  await categoryEditButton.click();
  observations.categoryEditorOpened = await page
    .getByRole("dialog", { name: "Editar categoria" })
    .isVisible();
  await page.getByRole("dialog", { name: "Editar categoria" }).getByRole("button", {
    name: "Cancelar",
  }).click();
}

async function cleanup() {
  if (createdItem) {
    await supabase.from("menu_items").delete().eq("id", createdItem.id);
    const marker = "/menu-images/";
    const imagePath = createdItem.image_url.split(marker)[1];
    if (imagePath) await supabase.storage.from("menu-images").remove([imagePath]);
  }

  const { data: testSettings } = await supabase
    .from("sms_logs")
    .select("id")
    .eq("to_phone", SETTINGS_PHONE)
    .gte("created_at", testStartedAt);
  for (const row of testSettings ?? []) createdSmsLogIds.push(row.id);

  if (createdSmsLogIds.length) {
    await supabase.from("sms_logs").delete().in("id", [...new Set(createdSmsLogIds)]);
  }
  if (originalOrder) {
    await supabase.from("orders").update({ status: originalOrder.status }).eq("id", originalOrder.id);
  }
}

(async () => {
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
    const context = browser.contexts()[0];
    page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") observations.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => observations.pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        observations.failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await authenticateIfNeeded();
    await exerciseMenuEditor();
    await saveTemporaryNotificationSettings();
    await exerciseAutomaticNotifications();
    console.log(JSON.stringify(observations, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
    if (page) await page.close();
    if (browser) await browser.close();
  }
})();
