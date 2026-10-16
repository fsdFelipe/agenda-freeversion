import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openDatabase } from "../src/modules/agenda/database.ts";
const db = await openDatabase({
  file: process.env.SQLITE_PATH,
  url: process.env.DATABASE_URL,
});
try {
  const data = await db.transaction(async (sql) => {
    const tables: Record<string, unknown[]> = {};
    for (const table of [
      "agenda_settings",
      "agenda_services",
      "agenda_bookings",
      "agenda_blocks",
      "agenda_audit",
    ])
      tables[table] = await sql.all("SELECT * FROM " + table);
    return {
      edition: "free",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      tables,
    };
  });
  await mkdir("backups", { recursive: true });
  const path = resolve("backups", "agenda-export-" + Date.now() + ".json");
  await writeFile(path, JSON.stringify(data, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  console.log("Exportação privada criada em " + path);
} finally {
  await db.close();
}
