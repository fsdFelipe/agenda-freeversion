import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  mode = process.argv[2];
if (!["dev", "start"].includes(mode)) throw new Error("Use dev ou start.");
const port =
  process.env.PORT ??
  new URL(process.env.APP_URL ?? "http://localhost:5173").port ??
  "5173";
const actualPort = port || "5173";
if (
  !/^\d+$/.test(actualPort) ||
  Number(actualPort) < 1 ||
  Number(actualPort) > 65535
)
  throw new Error("PORT inválida.");
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), mode, "--port", actualPort],
  { stdio: "inherit", windowsHide: true, env: process.env },
);
child.on("exit", (code) => process.exit(code ?? 1));
