/**
 * Build script for mcp-wallet-signer npm package using dnt (Deno to Node Transform).
 *
 * This is a thin MCP layer on top of browser-evm-signer.
 * No web UI build — that's bundled in the browser-evm-signer package.
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

// Build TypeScript with dnt
console.log("Building TypeScript with dnt...\n");
await build({
  entryPoints: [
    "./src/mod.ts",
    { kind: "bin", name: "mcp-wallet-signer", path: "./src/index.ts" },
  ],
  outDir,
  shims: {},
  scriptModule: false,
  typeCheck: false,
  test: false,
  importMap: "./deno.jsonc",
  // Map the local browser-evm-signer import to the npm package
  mappings: {
    "../browser-evm-signer/src/mod.ts": {
      name: "browser-evm-signer",
      version: "^0.1.0",
    },
  },
  // browser-evm-signer isn't published yet, skip npm install (dependency is correct in package.json)
  skipNpmInstall: true,
  package: {
    name: pkg.name,
    version: pkg.version,
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
    genPkg.mcpName = pkg.mcpName;
    genPkg.dependencies ??= {};
    // dnt doesn't detect trailing-slash import map entries, so inject manually
    genPkg.dependencies["@modelcontextprotocol/sdk"] = "^1.26.0";
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

// Copy README for npmjs display
const readmePath = join(projectDir, "..", "..", "README.md");
try {
  await Deno.copyFile(readmePath, join(outDir, "README.md"));
} catch {
  // README may not be at repo root
}

console.log("\n✓ Build complete!");
console.log(`  Output: ${outDir}`);
console.log("\nTo publish to npm:");
console.log(`  cd ${outDir} && npm publish`);
