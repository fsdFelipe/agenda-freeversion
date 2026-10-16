import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Database, Sql, DbValue } from "./types.ts";
export async function openDatabase(
  options: { file?: string; url?: string } = {},
): Promise<Database> {
  if (options.url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: options.url,
      max: 3,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    });
    return {
      kind: "postgres",
      async transaction(work) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock(741205116)");
          const sql: Sql = {
            async all<T>(statement: string, values: DbValue[] = []) {
              let i = 0;
              return (
                await client.query(
                  statement.replace(/\?/g, () => "$" + ++i),
                  values,
                )
              ).rows as T[];
            },
            async run(statement, values = []) {
              let i = 0;
              await client.query(
                statement.replace(/\?/g, () => "$" + ++i),
                values,
              );
            },
          };
          const result = await work(sql);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
  }
  const file = options.file ?? resolve(process.cwd(), ".data/agenda.sqlite");
  if (file !== ":memory:") await mkdir(dirname(file), { recursive: true });
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file, { timeout: 5000 });
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  let tail: Promise<unknown> = Promise.resolve();
  const sql: Sql = {
    async all<T>(statement: string, values: DbValue[] = []) {
      return db.prepare(statement).all(...values) as T[];
    },
    async run(statement, values = []) {
      db.prepare(statement).run(...values);
    },
  };
  return {
    kind: "sqlite",
    transaction<T>(work: (sql: Sql) => Promise<T>) {
      const current = tail.then(async () => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = await work(sql);
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      });
      tail = current.catch(() => undefined);
      return current;
    },
    async close() {
      await tail;
      db.close();
    },
  };
}
