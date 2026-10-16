import { resolve } from "node:path";
import { openDatabase } from "../../src/modules/agenda/database.ts";
import { migrate } from "../../src/modules/agenda/migrations.ts";
import { AuthService } from "../../src/modules/agenda/services/auth.service.ts";
import { secretToken } from "../../src/modules/agenda/security.ts";
export default async function setup() {
  process.env.AGENDA_TEST_PASSWORD = secretToken();
  for (const name of ["desktop", "mobile"]) {
    const db = await openDatabase({
      file: resolve(
        "work",
        "browser-" + process.env.AGENDA_E2E_RUN + "-" + name + ".sqlite",
      ),
    });
    try {
      await migrate(db);
      process.env["AGENDA_SETUP_" + name.toUpperCase()] =
        (await new AuthService(db).issueBootstrap()) ?? "";
    } finally {
      await db.close();
    }
  }
}
