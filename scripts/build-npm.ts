/**
 * Build script for npm package.
 *
 * This script:
 * 1. Compiles TypeScript server to JavaScript using esbuild
 * 2. Builds the Svelte web UI
 * 3. Copies everything to dist/
 */

import { ensureDir, copy } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join, dirname, fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const projectDir = join(scriptDir, "..");
const distDir = join(projectDir, "dist");
const srcDir = join(projectDir, "src");
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

async function main() {
  console.log("Building MCP Wallet Signer for npm...\n");

  // Clean dist directory
  console.log("1. Cleaning dist directory...");
  try {
    await Deno.remove(distDir, { recursive: true });
  } catch {
    // Directory doesn't exist, that's fine
  }
  await ensureDir(distDir);

  // Build server with esbuild (bundle for Node.js)
  console.log("\n2. Building server with esbuild...");
  await run([
    "deno",
    "run",
    "--allow-read",
    "--allow-write",
    "--allow-env",
    "--allow-run",
    "--allow-net",
    "npm:esbuild",
    join(srcDir, "index.ts"),
    "--bundle",
    "--platform=node",
    "--target=node18",
    "--format=esm",
    "--outfile=" + join(distDir, "index.js"),
    "--external:@modelcontextprotocol/sdk",
    "--external:viem",
    "--external:zod",
    "--external:open",
    "--banner:js=#!/usr/bin/env node",
  ]);

  // Make the output executable
  await Deno.chmod(join(distDir, "index.js"), 0o755);

  // Build web UI
  console.log("\n3. Building web UI...");
  await run(["deno", "install"], webDir);
  await run(["deno", "task", "build"], webDir);

  // Copy web dist to dist/web
  console.log("\n4. Copying web assets...");
  const webDistDir = join(webDir, "dist");
  const targetWebDir = join(distDir, "web");
  await copy(webDistDir, targetWebDir);

  console.log("\n✓ Build complete!");
  console.log(`  Output: ${distDir}`);
  console.log("\nTo publish to npm:");
  console.log("  cd " + projectDir);
  console.log("  npm publish");
}

main().catch((err) => {
  console.error("Build failed:", err);
  Deno.exit(1);
});
