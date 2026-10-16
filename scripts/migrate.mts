import { openDatabase } from "../src/modules/agenda/database.ts";
import { migrate } from "../src/modules/agenda/migrations.ts";
const db = await openDatabase({
  file: process.env.SQLITE_PATH,
  url: process.env.DATABASE_URL,
});
try {
  await migrate(db);
  console.log("Banco da Agenda Free atualizado: schema 1.");
} finally {
  await db.close();
}
