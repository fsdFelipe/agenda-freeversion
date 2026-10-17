import { test, expect, type Page } from "@playwright/test";
import { addDays } from "../../src/modules/agenda/policy.ts";
test.describe.configure({ mode: "serial" });
async function submitLogin(page: Page) {
  const [response, dashboard] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/agenda" &&
        response.request().postDataJSON()?.action === "login",
      { timeout: 30000 },
    ),
    page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/agenda" &&
        new URL(response.url()).searchParams.get("view") === "admin",
      { timeout: 30000 },
    ),
    page.getByRole("button", { name: "Entrar ↗", exact: true }).click(),
  ]);
  expect(response.status()).toBe(200);
  expect(dashboard.status()).toBe(200);
  await page.waitForURL("**/dashboard", { timeout: 30000 });
}
async function login(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail do administrador").fill("owner@example.com");
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.AGENDA_TEST_PASSWORD!);
  await submitLogin(page);
  await expect(
    page.getByRole("heading", { name: "Seu dia, em ordem." }),
  ).toBeVisible();
}
async function confirmBooking(page: Page) {
  const responseFor = (action: string) =>
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/agenda" &&
        response.request().postDataJSON()?.action === action,
      { timeout: 30000 },
    );
  const [reservation, details] = await Promise.all([
    responseFor("reserve"),
    responseFor("lookup"),
    page.getByRole("button", { name: "Confirmar meu horário" }).click(),
  ]);
  expect(reservation.status()).toBe(200);
  expect(details.status()).toBe(200);
}
async function nextWorkingDay(page: Page, offset = 1) {
  const info = await (await page.request.get("/api/agenda?view=public")).json();
  let day = addDays(info.today, offset);
  while ([0, 6].includes(new Date(day + "T12:00:00Z").getUTCDay()))
    day = addDays(day, 1);
  return day;
}
test("first-run configuration and service publishing through dashboard", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "/configurar#" +
      process.env["AGENDA_SETUP_" + testInfo.project.name.toUpperCase()],
  );
  await page
    .getByLabel("Nome do espaço ou profissional")
    .fill("Estúdio Aurora");
  await page
    .getByLabel("Profissão ou especialidade")
    .fill("Atendimento e bem-estar");
  await page.getByLabel("Nome do primeiro serviço").fill("Sessão individual");
  await page.getByLabel("E-mail do administrador").fill("owner@example.com");
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.AGENDA_TEST_PASSWORD!);
  await page
    .getByLabel("Repetir senha")
    .fill(process.env.AGENDA_TEST_PASSWORD!);
  const [configured] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/agenda" &&
        response.request().postDataJSON()?.action === "setup",
      { timeout: 30000 },
    ),
    page.getByRole("button", { name: "Criar minha agenda" }).click(),
  ]);
  expect(configured.status(), await configured.text()).toBe(200);
  await expect(page.getByRole("status")).toContainText("Sua agenda foi criada");
  await login(page);
  await page.getByRole("button", { name: "Serviços", exact: true }).click();
  await page.getByRole("button", { name: "Editar serviço" }).click();
  await page.getByLabel("Preço informativo (R$)").fill("80,00");
  await page.getByLabel("Publicado e disponível para agendar").check();
  await page.getByRole("button", { name: "Salvar serviço" }).click();
  await expect(page.getByRole("status")).toHaveText("Alterações salvas.");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("client books without account, downloads calendar and cancels by private link", async ({
  page,
}, testInfo) => {
  const day = await nextWorkingDay(page);
  await page.goto("/");
  await page.getByLabel("Dia do atendimento").fill(day);
  await page.getByRole("button", { name: "09:00", exact: true }).click();
  await page.getByLabel("Seu nome").fill("Pessoa de teste");
  await page.getByLabel("E-mail", { exact: true }).fill("client@example.com");
  await page.getByLabel("Telefone com DDD").fill("11999999999");
  await page.getByLabel("Li o aviso de uso dos dados").check();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/agenda-free-public-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  await confirmBooking(page);
  await expect(
    page.getByRole("heading", { name: "Reserva confirmada" }),
  ).toBeVisible();
  expect(new URL(page.url()).hash.length).toBe(44);
  const [calendar] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Adicionar ao calendário" }).click(),
  ]);
  expect(calendar.suggestedFilename()).toBe("meu-atendimento.ics");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reserva confirmada" }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancelar atendimento" }).click();
  await expect(
    page.getByRole("heading", { name: "Reserva cancelada" }),
  ).toBeVisible();
});
test("owner manages availability, blocking and appearance without code", async ({
  page,
}, testInfo) => {
  await login(page);
  await page.getByRole("button", { name: "Expediente", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Um ritmo que funciona para você." }),
  ).toBeVisible();
  await page.getByLabel("Antecedência mínima (minutos)").fill("30");
  await page
    .getByRole("button", { name: "Salvar expediente", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toHaveText("Alterações salvas.");
  const day = await nextWorkingDay(page, 7);
  await page.getByRole("button", { name: "Bloqueios", exact: true }).click();
  await page.getByLabel("Início do bloqueio").fill(day + "T09:00");
  await page.getByLabel("Fim do bloqueio").fill(day + "T10:00");
  await page.getByLabel("Motivo interno").fill("Pausa de teste");
  await page.getByRole("button", { name: "Criar bloqueio" }).click();
  await expect(page.getByText("Pausa de teste", { exact: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remover bloqueio" }).click();
  await expect(page.getByText("Nenhum bloqueio neste dia.")).toBeVisible();
  await page.getByRole("button", { name: "Meu site", exact: true }).click();
  await page
    .getByLabel("Apresentação", { exact: true })
    .fill(
      "Atendimento com atenção, tranquilidade e tempo reservado para você.",
    );
  await page.getByRole("button", { name: "Salvar meu site" }).click();
  await expect(page.getByRole("status")).toHaveText("Alterações salvas.");
  await page.getByRole("button", { name: "Minha agenda", exact: true }).click();
  await page.screenshot({
    path:
      "test-results/agenda-free-dashboard-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("private routes protected and logout revokes session", async ({
  page,
  request,
}) => {
  const r = await request.get("/api/agenda?view=admin");
  expect(r.status()).toBe(401);
  await page.goto("/reserva#invalid");
  await expect(
    page.getByText("Link privado inválido.", { exact: true }),
  ).toBeVisible();
  await login(page);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Acessar minha agenda" }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Acessar minha agenda" }),
  ).toBeVisible();
});
