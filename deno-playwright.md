# Deno + Playwright: Lessons Learned

## Fork Bomb Prevention
- **Never use Playwright 1.48.0 or older with Deno** — their worker spawning model causes exponential process growth under Deno's node compat
- Use Playwright **1.58.2+** which works correctly with Deno
- Never spawn `deno task dev` as a subprocess from tests — if the task starts an MCP stdio server, it will never start the HTTP server, causing infinite wait loops
- Start HTTP servers **in-process** using direct function calls, not subprocesses

## ESM Module Loading Error
When you see: `Playwright requires Node.js 18.19 or higher to load esm modules`

**Root cause**: Parent `package.json` has `"type": "module"`. Playwright's `fileIsModule()` walks up directories to find the nearest `package.json`, sees `"type": "module"`, and tries to use its ESM loader (`node:module.register`) which Deno doesn't support.

**Fix**: Add a `package.json` with `{"type": "commonjs"}` in the test directory to override the parent's module type.

## Svelte SSR Build Issue
When Svelte app shows blank page with error: `` `mount(...)` is not available on the server ``

**Root cause**: Svelte's package.json exports map has `"browser": "./src/index-client.js"` and `"default": "./src/index-server.js"`. Vite under Deno resolves to `"default"` (server).

**Fix**: Add to vite.config.ts:
```ts
resolve: {
  conditions: ["browser", "import", "module", "default"],
},
```

## Build Caching Gotcha
The `cp -r dist ../dist/web` task doesn't clean the destination first. Stale asset files persist. Always `rm -rf` the destination before copying, or verify the served HTML references the current bundle hash.

## Working deno.json Pattern
```json
{
  "tasks": {
    "prepare": "deno cache --node-modules-dir playwright.config.ts spec-file.spec.ts",
    "test": "deno task prepare && deno run -A npm:@playwright/test@latest/cli test"
  },
  "imports": {
    "@playwright/test": "npm:@playwright/test@1.58.2"
  },
  "nodeModulesDir": "auto"
}
```

Plus `package.json` in same directory: `{"type": "commonjs"}`
