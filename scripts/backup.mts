import { backup, DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
if (process.env.DATABASE_URL)
  throw new Error(
    "PostgreSQL: use backup do provedor ou pg_dump. Consulte o manual.",
  );
await mkdir("backups", { recursive: true });
const path = resolve(
  "backups",
  "agenda-" + new Date().toISOString().replaceAll(":", "-") + ".sqlite",
);
const source = new DatabaseSync(
  process.env.SQLITE_PATH ?? ".data/agenda.sqlite",
  { readOnly: true },
);
try {
  await backup(source, path);
  console.log("Backup privado criado em " + path);
} finally {
  source.close();
}
