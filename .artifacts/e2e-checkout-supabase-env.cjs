const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const APP_URL = "http://127.0.0.1:8080";
const supabase = createClient(process.env.SJA_SUPABASE_URL, process.env.SJA_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let browser;
let page;
let orderId;
const result = {
  confirmationPage: false,
  orderPersisted: false,
  itemsPersisted: false,
  missingEnvironmentError: false,
  consoleErrors: [],
  failedResponses: [],
};

async function cleanup() {
  if (!orderId) return;
  await supabase.from("sms_logs").delete().eq("order_id", orderId);
  await supabase.from("orders").delete().eq("id", orderId);
}

(async () => {
  try {
    const { data: item, error } = await supabase
      .from("menu_items")
      .select("id, name, price_cents, image_url")
      .eq("available", true)
      .limit(1)
      .single();
    if (error || !item) throw new Error(error?.message ?? "Menu sem produtos");

    browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
    page = await browser.contexts()[0].newPage();
    page.on("console", (message) => {
      if (message.type() === "error") result.consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        result.failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto(`${APP_URL}/menu`, { waitUntil: "networkidle" });
    await page.evaluate((cartItem) => {
      localStorage.setItem("sja-cart-v2", JSON.stringify([{ ...cartItem, quantity: 1 }]));
    }, item);
    await page.goto(`${APP_URL}/checkout`, { waitUntil: "networkidle" });

    await page.getByLabel("Nome").fill("Teste de checkout");
    await page.getByLabel("Telefone").fill("+244900000000");
    await page.getByLabel("Morada").fill("Morada temporária de validação");
    await page.getByRole("button", { name: /^Confirmar pedido/ }).click();
    await page.waitForURL(/\/pedido\/[0-9a-f-]+$/);

    orderId = page.url().split("/").pop();
    result.confirmationPage = await page.getByText(/Pedido SJA-/).first().isVisible();
    result.missingEnvironmentError = await page
      .getByText(/Missing Supabase environment variable/i)
      .isVisible()
      .catch(() => false);

    const [order, items] = await Promise.all([
      supabase.from("orders").select("id").eq("id", orderId).single(),
      supabase.from("order_items").select("id").eq("order_id", orderId),
    ]);
    if (order.error) throw order.error;
    if (items.error) throw items.error;
    result.orderPersisted = Boolean(order.data);
    result.itemsPersisted = Boolean(items.data?.length);

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
