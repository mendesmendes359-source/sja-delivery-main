const { chromium } = require("playwright");

const APP_URL = "http://127.0.0.1:8080";
const routes = [
  { path: "/", expected: /Grande no sabor, rápido a chegar/i },
  { path: "/menu", expected: /^O nosso menu$/i },
  { path: "/checkout", expected: /^Finalizar pedido$/i },
  { path: "/admin", expected: /Dashboard/i },
  { path: "/admin/pedidos", expected: /^Pedidos$/i },
  { path: "/admin/entregas", expected: /^Entregas$/i },
  { path: "/admin/menu", expected: /^Menu$/i },
  { path: "/admin/stock", expected: /^Stock$/i },
  { path: "/admin/financeiro", expected: /^Financeiro$/i, asyncMarker: /Receita entregue/i },
  { path: "/admin/sms", expected: /^SMS$/i },
  { path: "/admin/utilizadores", expected: /^Utilizadores$/i, asyncMarker: /Contas registadas/i },
];

let browser;
let page;
const result = {
  routes: [],
  consoleErrors: [],
  pageErrors: [],
  failedResponses: [],
  environmentErrors: [],
};

async function login() {
  await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL);
  await page.getByLabel("Senha").fill(process.env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin/);
}

(async () => {
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
    page = await browser.contexts()[0].newPage();
    page.on("console", (message) => {
      if (message.type() === "error") result.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => result.pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        result.failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    for (const route of routes) {
      let response = await page.goto(`${APP_URL}${route.path}`, { waitUntil: "networkidle" });
      if (page.url().includes("/auth")) {
        await login();
        response = await page.goto(`${APP_URL}${route.path}`, { waitUntil: "networkidle" });
      }

      await page.getByRole("heading", { name: route.expected }).first().waitFor();
      if (route.asyncMarker) await page.getByText(route.asyncMarker).first().waitFor();

      const environmentError = await page
        .getByText(/Missing Supabase|Configuração .*Supabase em falta|Connect Supabase/i)
        .first()
        .isVisible()
        .catch(() => false);
      const usersError =
        route.path === "/admin/utilizadores"
          ? await page
              .getByText("Não foi possível carregar os utilizadores.")
              .isVisible()
              .catch(() => false)
          : false;

      if (environmentError || usersError) result.environmentErrors.push(route.path);
      result.routes.push({
        path: route.path,
        status: response?.status() ?? null,
        environmentError,
        usersError,
      });
    }

    console.log(JSON.stringify(result, null, 2));
    if (
      result.consoleErrors.length ||
      result.pageErrors.length ||
      result.failedResponses.length ||
      result.environmentErrors.length
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
})();
