import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function getVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(dir, "..", "package.json"), "utf-8"));
    return pkg.version;
  } catch {
    return "dev";
  }
}

export const VERSION = getVersion();
