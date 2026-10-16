import { openDatabase } from "../src/modules/agenda/database.ts";
import { AgendaService } from "../src/modules/agenda/services/agenda.service.ts";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const data = JSON.parse(input),
  db = await openDatabase({ file: data.file });
try {
  await new AgendaService(db, () => data.now).reserve(data.booking);
  process.stdout.write(JSON.stringify({ ok: true }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      code: error instanceof Error && "code" in error ? error.code : "UNKNOWN",
    }),
  );
} finally {
  await db.close();
}
