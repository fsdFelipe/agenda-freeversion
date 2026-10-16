import { readFile, mkdir, cp, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = process.cwd(),
  version = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  ).version;
const docs = resolve(
  process.env.AGENDA_DOCS ?? "../docs agenda-free/documentacao",
);
const out = resolve(process.env.AGENDA_OUTPUT ?? "dist");
const stage = resolve(root, "work/package-" + Date.now());
await mkdir(stage, { recursive: true });
await mkdir(out, { recursive: true });
const project = resolve(stage, "agenda-free-v" + version + "-projeto");
const manual = resolve(stage, "agenda-free-v" + version + "-documentacao");
await mkdir(project);
await mkdir(resolve(manual, "documentacao"), { recursive: true });
for (const name of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next-env.d.ts",
  "next.config.ts",
  "playwright.config.ts",
  ".gitignore",
  ".gitattributes",
  ".github",
  ".env.example",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "third-party",
  "Iniciar Agenda.vbs",
  "Parar Agenda.vbs",
  "Dockerfile",
  ".dockerignore",
  "public",
  "src",
  "scripts",
  "tests",
])
  await cp(resolve(root, name), resolve(project, name), { recursive: true });
await cp(docs, resolve(manual, "documentacao"), { recursive: true });
const quote = (text) => "'" + text.replaceAll("'", "''") + "'";
const manifest = [];
for (const dir of [project, manual]) {
  const zip = resolve(out, basename(dir) + ".zip");
  const command =
    "Compress-Archive -LiteralPath " +
    quote(dir) +
    " -DestinationPath " +
    quote(zip) +
    " -Force";
  execFileSync("powershell.exe", ["-NoProfile", "-Command", command], {
    windowsHide: true,
  });
  const bytes = await readFile(zip);
  manifest.push({
    file: basename(zip),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  resolve(out, "agenda-free-entrega.json"),
  JSON.stringify({ version, archives: manifest }, null, 2),
);
console.log(JSON.stringify({ stage, out, archives: manifest }, null, 2));
