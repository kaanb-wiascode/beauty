import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const appRoot = process.cwd();
const standaloneRoot = resolve(appRoot, ".next/standalone/apps/marketing");

function copyIfExists(source, destination) {
  if (!existsSync(source)) return;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, force: true });
}

copyIfExists(resolve(appRoot, ".next/static"), resolve(standaloneRoot, ".next/static"));
copyIfExists(resolve(appRoot, "public"), resolve(standaloneRoot, "public"));

console.log("Standalone runtime assets prepared.");
