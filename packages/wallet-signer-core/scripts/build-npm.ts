/**
 * Build script for wallet-signer-core npm package using dnt (Deno to Node Transform).
 */

import { build, emptyDir } from "jsr:@deno/dnt@0.42.3";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { parse as parseJsonc } from "jsr:@std/jsonc@1";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const projectDir = join(scriptDir, "..");
const outDir = join(projectDir, "npm");

const denoJsoncRaw = await Deno.readTextFile(join(projectDir, "deno.jsonc"));
// deno-lint-ignore no-explicit-any
const denoConfig = parseJsonc(denoJsoncRaw) as any;
const pkg = denoConfig.npm;

await emptyDir(outDir);

console.log("1. Building TypeScript with dnt...\n");
await build({
  entryPoints: ["./src/mod.ts"],
  outDir,
  shims: {},
  scriptModule: false,
  typeCheck: false,
  test: false,
  importMap: "./deno.jsonc",
  package: {
    name: pkg.name,
    version: denoConfig.version,
    description: pkg.description,
    type: "module",
    license: pkg.license,
    repository: pkg.repository,
    author: pkg.author,
    keywords: pkg.keywords,
    engines: pkg.engines,
  },
  postBuild() {
    const genPkgPath = join(outDir, "package.json");
    const genPkg = JSON.parse(Deno.readTextFileSync(genPkgPath));
    genPkg.exports = {
      ".": { import: { types: "./esm/mod.d.ts", default: "./esm/mod.js" } },
    };
    Deno.writeTextFileSync(genPkgPath, JSON.stringify(genPkg, null, 2) + "\n");
  },
});

console.log("\n✓ Build complete!");
console.log(`  Output: ${outDir}`);
console.log("\nTo publish to npm:");
console.log(`  cd ${outDir} && npm publish`);
