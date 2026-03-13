/**
 * Build script for browser-evm-signer npm package using dnt (Deno to Node Transform).
 *
 * The web UI is now inline HTML (src/web-ui.ts), so no separate Svelte build is needed.
 */

import { build, emptyDir } from "jsr:@deno/dnt@0.42.3";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { parse as parseJsonc } from "jsr:@std/jsonc@1";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const projectDir = join(scriptDir, "..");
const outDir = join(projectDir, "npm");

// Read metadata from deno.jsonc (single source of truth)
const denoJsoncRaw = await Deno.readTextFile(join(projectDir, "deno.jsonc"));
// deno-lint-ignore no-explicit-any
const denoConfig = parseJsonc(denoJsoncRaw) as any;
const pkg = denoConfig.npm;

await emptyDir(outDir);

// 1. Build TypeScript with dnt
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
    genPkg.dependencies ??= {};
    // viem must be a peer dependency so consumers share a single copy (avoids duplicate type errors)
    genPkg.peerDependencies = { viem: genPkg.dependencies.viem || "^2.46.0" };
    delete genPkg.dependencies.viem;
    // Add types conditions to exports for TypeScript consumers
    genPkg.exports = {
      ".": { import: { types: "./esm/mod.d.ts", default: "./esm/mod.js" } },
    };
    Deno.writeTextFileSync(genPkgPath, JSON.stringify(genPkg, null, 2) + "\n");
  },
});

// 2. Copy README for npmjs display
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
