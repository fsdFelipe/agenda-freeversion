import { AgendaService } from "../services/agenda.service.ts";
import { AuthService } from "../services/auth.service.ts";
import { AgendaError, ensure } from "../errors.ts";
import { obj } from "../validators.ts";
export const cookieName = "agenda_session";
export function sessionToken(request: Request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="));
  return value ? value.slice(cookieName.length + 1) : null;
}
async function body(request: Request) {
  ensure(
    request.headers.get("content-type")?.split(";")[0].trim() ===
      "application/json",
    "CONTENT",
    "Envie JSON.",
    415,
  );
  const reader = request.body?.getReader();
  ensure(reader, "BODY", "Conteúdo ausente.");
  const values: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      ensure(size <= 16384, "SIZE", "Conteúdo muito grande.", 413);
      values.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const full = new Uint8Array(size);
  let i = 0;
  for (const part of values) {
    full.set(part, i);
    i += part.length;
  }
  try {
    return obj(JSON.parse(new TextDecoder().decode(full)));
  } catch (e) {
    if (e instanceof AgendaError) throw e;
    throw new AgendaError("JSON", "Conteúdo JSON inválido.", 400);
  }
}
export function createHttp(
  agenda: AgendaService,
  auth: AuthService,
  origin: string,
  trustProxy = false,
) {
  ensure(
    new URL(origin).origin === origin,
    "ORIGIN",
    "APP_URL deve ser uma origem completa, sem caminho ou barra final.",
  );
  const cookie = (token: string, maxAge = 28800) =>
    cookieName +
    "=" +
    token +
    "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" +
    maxAge +
    (origin.startsWith("https:") ? "; Secure" : "");
  return async function handle(request: Request) {
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    };
    try {
      const visitor = trustProxy
        ? (request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown")
        : "shared";
      ensure(
        await auth.limit("http:" + visitor, 300, 60),
        "LIMIT",
        "Muitas solicitações. Aguarde um minuto.",
        429,
      );
      const url = new URL(request.url);
      if (request.method === "GET") {
        const view = url.searchParams.get("view") ?? "public";
        if (view === "public")
          return Response.json(await agenda.publicInfo(), { headers });
        if (view === "slots")
          return Response.json(
            await agenda.slots(
              url.searchParams.get("service"),
              url.searchParams.get("date"),
            ),
            { headers },
          );
        const authenticated = await auth.authenticated(sessionToken(request));
        if (view === "session")
          return Response.json(
            { authenticated, configured: await auth.initialized() },
            { headers },
          );
        ensure(authenticated, "AUTH", "Entre para acessar sua agenda.", 401);
        ensure(view === "admin", "VIEW", "Consulta desconhecida.", 400);
        return Response.json(
          await agenda.dashboard(url.searchParams.get("date")),
          { headers },
        );
      }
      ensure(request.method === "POST", "METHOD", "Método não permitido.", 405);
      ensure(
        request.headers.get("origin") === origin,
        "ORIGIN",
        "Origem não autorizada.",
        403,
      );
      const input = await body(request),
        action = input.action,
        data = obj(input.data ?? {});
      let result: unknown = { ok: true };
      switch (action) {
        case "setup":
          ensure(
            await auth.limit("setup:" + visitor, 5, 900),
            "LIMIT",
            "Muitas tentativas de configuração. Aguarde.",
            429,
          );
          await auth.setup(data);
          break;
        case "login": {
          const email =
            typeof data.email === "string"
              ? data.email.trim().toLowerCase()
              : "invalid";
          ensure(
            await auth.limit("login:" + email, 5, 900),
            "LIMIT",
            "Muitas tentativas de acesso. Aguarde 15 minutos.",
            429,
          );
          const session = await auth.login(data);
          headers["Set-Cookie"] = cookie(session.token);
          break;
        }
        case "logout":
          await auth.logout(sessionToken(request));
          headers["Set-Cookie"] = cookie("", 0);
          break;
        case "reserve":
          ensure(
            await auth.limit("booking:" + visitor, 30, 300),
            "LIMIT",
            "Muitos envios. Aguarde alguns minutos.",
            429,
          );
          result = await agenda.reserve(data);
          break;
        case "lookup":
          result = await agenda.privateBooking(data.token);
          break;
        case "cancel":
          result = await agenda.customerCancel(data.token);
          break;
        default:
          ensure(
            await auth.authenticated(sessionToken(request)),
            "AUTH",
            "Entre para continuar.",
            401,
          );
          switch (action) {
            case "service":
              result = await agenda.saveService(data);
              break;
            case "settings":
              result = await agenda.saveSettings(data);
              break;
            case "block":
              result = await agenda.addBlock(data);
              break;
            case "removeBlock":
              await agenda.removeBlock(data.id);
              break;
            case "status":
              result = await agenda.changeStatus(data);
              break;
            case "password":
              await auth.changePassword(data.current, data.next);
              headers["Set-Cookie"] = cookie("", 0);
              break;
            default:
              throw new AgendaError("ACTION", "Ação desconhecida.", 400);
          }
      }
      return Response.json(result, { headers });
    } catch (error) {
      if (error instanceof AgendaError)
        return Response.json(
          { error: error.message, code: error.code },
          { status: error.status, headers },
        );
      console.error(
        "[agenda-free] Falha interna",
        error instanceof Error ? error.name : "Unknown",
      );
      return Response.json(
        {
          error:
            "Não foi possível concluir. Tente novamente ou entre em contato.",
          code: "INTERNAL",
        },
        { status: 500, headers },
      );
    }
  };
}
