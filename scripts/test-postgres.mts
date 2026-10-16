import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { openDatabase } from "../src/modules/agenda/database.ts";
import { migrate } from "../src/modules/agenda/migrations.ts";
import { AuthService } from "../src/modules/agenda/services/auth.service.ts";
import { AgendaService } from "../src/modules/agenda/services/agenda.service.ts";
import { secretToken } from "../src/modules/agenda/security.ts";
import { localDay, addDays } from "../src/modules/agenda/policy.ts";
const connection = process.env.AGENDA_TEST_DATABASE_URL;
if (!connection)
  throw new Error(
    "Defina AGENDA_TEST_DATABASE_URL com uma instância PostgreSQL de teste.",
  );
const schema = "agenda_free_test_" + randomBytes(8).toString("hex");
if (!/^agenda_free_test_[a-f0-9]{16}$/.test(schema))
  throw new Error("Schema de teste inválido.");
const admin = new Pool({ connectionString: connection, max: 1 });
let db: Awaited<ReturnType<typeof openDatabase>> | undefined;
try {
  await admin.query("CREATE SCHEMA " + schema);
  const url = new URL(connection);
  url.searchParams.set("options", "-c search_path=" + schema);
  db = await openDatabase({ url: url.href });
  await migrate(db);
  const auth = new AuthService(db),
    agenda = new AgendaService(db),
    token = await auth.issueBootstrap();
  await auth.setup({
    token,
    email: "test@example.com",
    password: secretToken(),
    name: "Teste isolado",
    profession: "Teste",
    serviceName: "Serviço de teste",
    duration: 30,
  });
  const snapshot = await agenda.dashboard(null),
    service = snapshot.services[0];
  await agenda.saveService({ ...service, active: true });
  let day = addDays(localDay(Date.now(), snapshot.settings.timeZone), 1);
  while ([0, 6].includes(new Date(day + "T12:00:00Z").getUTCDay()))
    day = addDays(day, 1);
  const slot = (await agenda.slots(service.id, day))[0];
  assert.ok(slot);
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      agenda.reserve({
        serviceId: service.id,
        startsAt: slot.startsAt,
        name: "Teste",
        email: "client@example.com",
        phone: "11999999999",
        note: "",
        consent: true,
        website: "",
        requestToken: secretToken(),
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await agenda.dashboard(day)).bookings.length, 1);
  console.log(
    "PostgreSQL: migrations, setup, persistência e concorrência aprovados em schema isolado.",
  );
} finally {
  await db?.close();
  await admin.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
  await admin.end();
}
