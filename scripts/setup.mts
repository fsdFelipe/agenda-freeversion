import { openDatabase } from "../src/modules/agenda/database.ts";
import { migrate } from "../src/modules/agenda/migrations.ts";
import { AuthService } from "../src/modules/agenda/services/auth.service.ts";
const db = await openDatabase({
  file: process.env.SQLITE_PATH,
  url: process.env.DATABASE_URL,
});
try {
  await migrate(db);
  const token = await new AuthService(db).issueBootstrap();
  const origin = process.env.APP_URL ?? "http://localhost:5173";
  const result = {
    configured: !token,
    url: token ? origin + "/configurar#" + token : origin + "/entrar",
  };
  if (process.argv.includes("--json")) console.log(JSON.stringify(result));
  else {
    console.log(
      token
        ? "Link privado de configuração, válido por 30 minutos. Não compartilhe:"
        : "A agenda já está configurada.",
    );
    console.log(result.url);
    console.log("Com o servidor iniciado, abra esse endereço no navegador.");
  }
} finally {
  await db.close();
}
