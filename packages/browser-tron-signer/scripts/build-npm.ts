/**
 * Build script for browser-tron-signer npm package using dnt (Deno to Node Transform).
 *
 * The web UI is inline HTML (src/web-ui.gen.ts), so no separate frontend build is needed.
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
    // dnt emits files under esm/<pkg>/src/ because of the wallet-signer-core workspace member.
    // Point exports at the real mod.js location instead of the flat layout dnt assumes.
    const genPkgPath = join(outDir, "package.json");
    const genPkg = JSON.parse(Deno.readTextFileSync(genPkgPath));
    const modJs = "./esm/browser-tron-signer/src/mod.js";
    const modDts = "./esm/browser-tron-signer/src/mod.d.ts";
    genPkg.module = modJs;
    genPkg.exports = {
      ".": { import: { types: modDts, default: modJs } },
    };
    Deno.writeTextFileSync(genPkgPath, JSON.stringify(genPkg, null, 2) + "\n");
  },
});

console.log("\n2. Copying README...");
const readmePath = join(projectDir, "README.md");
try {
  await Deno.copyFile(readmePath, join(outDir, "README.md"));
} catch {
  // README may not exist yet in this package
}

console.log("\n✓ Build complete!");
console.log(`  Output: ${outDir}`);
console.log("\nTo publish to npm:");
console.log(`  cd ${outDir} && npm publish`);
