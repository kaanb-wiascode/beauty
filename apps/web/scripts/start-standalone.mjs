import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const serverPath = path.resolve(process.cwd(), ".next/standalone/apps/web/server.js");
const port = process.env.PORT || "10000";
const hostname = process.env.HOSTNAME || "0.0.0.0";

if (!existsSync(serverPath)) {
  console.error(`[web-start] Standalone server bulunamadı: ${serverPath}`);
  process.exit(1);
}

console.log(`[web-start] Standalone web server başlatılıyor: ${hostname}:${port}`);

const child = spawn(process.execPath, [serverPath], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: hostname,
    PORT: port,
  },
});

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGTERM", () => {
  console.log("[web-start] SIGTERM alındı; child process sonlandırılıyor.");
  forward("SIGTERM");
});
process.on("SIGINT", () => {
  console.log("[web-start] SIGINT alındı; child process sonlandırılıyor.");
  forward("SIGINT");
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[web-start] Standalone server signal ile kapandı: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
