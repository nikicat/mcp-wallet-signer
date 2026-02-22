/**
 * Build script for npm package using dnt (Deno to Node Transform).
 *
 * This script:
 * 1. Compiles TypeScript to JS + .d.ts via dnt
 * 2. Builds the Svelte web UI
 * 3. Copies web assets into the npm output directory
 */

import { build, emptyDir } from "jsr:@deno/dnt";
import { copy } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const projectDir = join(scriptDir, "..");
const outDir = join(projectDir, "npm");
const webDir = join(projectDir, "web");

async function run(cmd: string[], cwd?: string): Promise<void> {
  console.log(`Running: ${cmd.join(" ")}`);
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd: cwd || projectDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await command.output();
  if (code !== 0) {
    throw new Error(`Command failed with code ${code}`);
  }
}

// Read metadata from root package.json
const pkg = JSON.parse(await Deno.readTextFile(join(projectDir, "package.json")));

await emptyDir(outDir);

// 1. Build TypeScript with dnt
console.log("1. Building TypeScript with dnt...\n");
await build({
  entryPoints: [
    "./src/mod.ts",
    { name: "./wallet-only", path: "./src/wallet-only.ts" },
    { kind: "bin", name: "mcp-wallet-signer", path: "./src/index.ts" },
  ],
  outDir,
  shims: {},
  scriptModule: false,
  typeCheck: false,
  test: false,
  importMap: "./deno.jsonc",
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
    // dnt doesn't detect trailing-slash import map entries, so inject manually
    genPkg.dependencies ??= {};
    genPkg.dependencies["@modelcontextprotocol/sdk"] = "^1.0.4";
    // viem must be a peer dependency so consumers share a single copy (avoids duplicate type errors)
    genPkg.peerDependencies = { viem: genPkg.dependencies.viem || "^2.46.0" };
    delete genPkg.dependencies.viem;
    // Add types conditions to exports for TypeScript consumers
    genPkg.exports = {
      ".": { import: { types: "./esm/mod.d.ts", default: "./esm/mod.js" } },
      "./wallet-only": { import: { types: "./esm/wallet-only.d.ts", default: "./esm/wallet-only.js" } },
    };
    Deno.writeTextFileSync(genPkgPath, JSON.stringify(genPkg, null, 2) + "\n");
  },
});

// 2. Build web UI
console.log("\n2. Building web UI...");
await run(["deno", "install"], webDir);
await run(["deno", "task", "build"], webDir);

// 3. Copy web assets into npm output
console.log("\n3. Copying web assets...");
await copy(join(webDir, "dist"), join(outDir, "web"));

console.log("\n✓ Build complete!");
console.log(`  Output: ${outDir}`);
console.log("\nTo publish to npm:");
console.log(`  cd ${outDir} && npm publish`);
