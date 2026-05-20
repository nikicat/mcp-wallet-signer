/**
 * Generate src/web-ui.gen.ts from src/index.html.
 *
 * Reads the HTML file and wraps it in a TypeScript module that exports
 * the content as a string. Lets us author real HTML (with editor support,
 * linting, etc.) while keeping runtime zero-filesystem-dependency.
 *
 * Usage: deno run -A scripts/gen-web-ui.ts
 */

import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const projectDir = join(scriptDir, "..");
const htmlPath = join(projectDir, "src", "index.html");
const outPath = join(projectDir, "src", "web-ui.gen.ts");

const html = await Deno.readTextFile(htmlPath);

const escaped = html
  .replaceAll("\\", "\\\\")
  .replaceAll("`", "\\`")
  .replaceAll("${", "\\${");

const code = `// AUTO-GENERATED from src/index.html — do not edit directly.
// Regenerate: deno task gen:web-ui

/** Returns the self-contained HTML for the TRON wallet signing UI. */
export function getIndexHtml(): string {
  // deno-fmt-ignore
  return \`${escaped}\`;
}
`;

await Deno.writeTextFile(outPath, code);
console.log(`Generated ${outPath}`);
