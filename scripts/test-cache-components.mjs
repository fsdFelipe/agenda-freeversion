import { readFile, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
// This is a build acceptance check. Do not run concurrently with dev/build.
const root = process.cwd();
try {
  await access(resolve(root, ".next/dev/lock"));
  throw new Error("Pare o servidor de desenvolvimento antes deste teste.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const configFile = resolve(root, "next.config.ts");
const original = await readFile(configFile, "utf8");
if (!original.includes("export default config;"))
  throw new Error(
    "Configuração personalizada: execute o build com cacheComponents e partialPrefetching ativados manualmente.",
  );
try {
  await writeFile(
    configFile,
    original.replace(
      "export default config;",
      "export default { ...config, cacheComponents: true, partialPrefetching: true };",
    ),
  );
  const require = createRequire(resolve(root, "package.json"));
  const result = spawnSync(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "build"],
    {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await writeFile(configFile, original);
}
