import {
  readFile,
  readdir,
  mkdir,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { resolve, relative } from "node:path";
const root = process.cwd(),
  lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
const out = resolve(root, "third-party");
await mkdir(out, { recursive: true });
const rows = [
  "# Avisos de terceiros",
  "",
  "Inventário do lockfile. Licenças individuais prevalecem para terceiros.",
  "",
  "| Pacote | Versão | Licença | Uso |",
  "|---|---|---|---|",
];
let copied = 0;
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path.startsWith("node_modules/")) continue;
  const name = pkg.name ?? path.split("node_modules/").at(-1);
  rows.push(
    "| " +
      name +
      " | " +
      pkg.version +
      " | " +
      (pkg.license ?? "consultar pacote") +
      " | " +
      (pkg.dev ? "desenvolvimento" : "distribuição/execução") +
      " |",
  );
  const base = resolve(root, path);
  let entries;
  try {
    entries = await readdir(base);
  } catch {
    continue;
  }
  for (const file of entries.filter((name) =>
    /^(licen[cs]e|copying|notice)([.-]|$)/i.test(name),
  )) {
    const dest = resolve(
      out,
      name.replaceAll("/", "_") + "-" + pkg.version + "-" + file,
    );
    try {
      await copyFile(resolve(base, file), dest);
      copied++;
    } catch (e) {
      if (e.code !== "EISDIR") throw e;
    }
  }
}
async function notices(base) {
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = resolve(base, entry.name);
    if (entry.isDirectory()) await notices(path);
    else if (/^(license|notice)([.-]|$)/i.test(entry.name)) {
      await copyFile(
        path,
        resolve(
          out,
          "next-bundled-" +
            relative(resolve(root, "node_modules/next/dist/compiled"), path)
              .replaceAll("\\", "_")
              .replaceAll("/", "_"),
        ),
      );
      copied++;
    }
  }
}
await notices(resolve(root, "node_modules/next/dist/compiled"));
await writeFile(
  resolve(root, "THIRD_PARTY_NOTICES.md"),
  rows.join("\n") +
    "\n\nLicenças e avisos disponíveis em third-party/. Arquivos coletados: " +
    copied +
    ".\n",
  "utf8",
);
console.log("Avisos preparados: " + copied + ".");
