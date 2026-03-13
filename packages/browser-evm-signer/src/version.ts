import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function getVersion(): string {
  // When loaded from JSR, import.meta.url is https:// — filesystem detection won't work
  if (!import.meta.url.startsWith("file://")) return "dev";

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");

  // npm bundle: package.json exists at package root
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf-8")).version;
  } catch { /* not in npm bundle */ }

  // Local dev: read from deno.jsonc
  try {
    const raw = readFileSync(join(root, "deno.jsonc"), "utf-8");
    return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")).version;
  } catch { /* not available */ }

  return "dev";
}

export const VERSION: string = getVersion();
