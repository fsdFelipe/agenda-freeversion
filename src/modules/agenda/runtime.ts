import { openDatabase } from "./database.ts";
import { migrate } from "./migrations.ts";
import { AgendaService } from "./services/agenda.service.ts";
import { AuthService } from "./services/auth.service.ts";
import { createHttp } from "./controllers/http.ts";
async function initialize() {
  if (process.env.VERCEL && !process.env.DATABASE_URL)
    throw new Error("Vercel requer PostgreSQL persistente.");
  const db = await openDatabase({
    file: process.env.SQLITE_PATH,
    url: process.env.DATABASE_URL,
  });
  if (!process.env.DATABASE_URL || process.env.DATABASE_AUTO_MIGRATE === "true")
    await migrate(db);
  else
    await db.transaction(async (sql) => {
      const rows = await sql.all<{ version: number }>(
        "SELECT version FROM agenda_meta WHERE id=1",
      );
      if (rows[0]?.version !== 1)
        throw new Error("Execute db:migrate antes de publicar.");
    });
  const agenda = new AgendaService(db),
    auth = new AuthService(db);
  const origin = process.env.APP_URL ?? "http://localhost:5173";
  if (process.env.VERCEL && !origin.startsWith("https://"))
    throw new Error("Configure APP_URL com HTTPS.");
  return {
    db,
    agenda,
    auth,
    handle: createHttp(
      agenda,
      auth,
      origin,
      process.env.TRUST_PROXY_HEADERS === "true",
    ),
  };
}
const globalApp = globalThis as typeof globalThis & {
  __agendaFree?: ReturnType<typeof initialize>;
};
export function application() {
  if (!globalApp.__agendaFree)
    globalApp.__agendaFree = initialize().catch((error) => {
      globalApp.__agendaFree = undefined;
      throw error;
    });
  return globalApp.__agendaFree;
}
export async function handleAgenda(request: Request) {
  try {
    return await (await application()).handle(request);
  } catch (error) {
    console.error(
      "[agenda-free] Configuração indisponível",
      error instanceof Error ? error.name : "Unknown",
    );
    return Response.json(
      {
        error: "Confira a configuração do banco e APP_URL no servidor.",
        code: "CONFIGURATION",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
