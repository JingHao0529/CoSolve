// Operator entry point. No authentication is mocked or changed.
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(apiDir, ".local/import-runs", randomUUID());
await mkdir(directory, { recursive: true });
try {
  const output = path.join(directory, "worker.mjs");
  await build({
    entryPoints: [path.join(apiDir, "scripts/import-review-file.ts")], outfile: output,
    bundle: true, platform: "node", format: "esm", logLevel: "silent",
    external: ["express", "openai", "pg", "pg-native", "drizzle-orm", "*.node"],
  });
  const child = spawn(process.execPath, [output, ...process.argv.slice(2)], { stdio: "inherit" });
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  process.exitCode = await new Promise(resolve => child.on("exit", code => resolve(code ?? 1)));
} finally {
  await rm(directory, { recursive: true, force: true });
}
