# Deno + Playwright: Lessons Learned

## Fork Bomb Prevention

- **Never use Playwright 1.48.0 or older with Deno** — their worker spawning model causes exponential process growth under Deno's
  node compat
- Use Playwright **1.60.0+** which works correctly with Deno (see the `index.js:17` note below for the 1.58 caveat)
- Never spawn `deno task dev` as a subprocess from tests — if the task starts an MCP stdio server, it will never start the HTTP
  server, causing infinite wait loops
- Start HTTP servers **in-process** using direct function calls, not subprocesses

## ESM Module Loading Error

When you see: `Playwright requires Node.js 18.19 or higher to load esm modules`

**Root cause**: Parent `package.json` has `"type": "module"`. Playwright's `fileIsModule()` walks up directories to find the
nearest `package.json`, sees `"type": "module"`, and tries to use its ESM loader (`node:module.register`) which Deno doesn't
support.

**Fix**: Add a `package.json` with `{"type": "commonjs"}` in the test directory to override the parent's module type.

## `ReferenceError: module is not defined` at `@playwright/test/index.js:17`

On newer Deno builds (≥ 2.7, possibly fork-specific) loading `@playwright/test@1.58.x` fails because Deno's node-compat polyfill
(`loadMaybeCjs` → `loadESMFromCJS`) mis-classifies `index.js` — which is a one-liner `module.exports = require('playwright/test')`
— as ESM, and the bare `module` reference then blows up.

**Fix**: upgrade the `@playwright/test` pin (everywhere — `imports`, the `test` task, and `playwright:install`) to **1.60.0** or
later. The internal bundling changed enough between 1.58 → 1.60 that the buggy heuristic stops tripping. `--unstable-detect-cjs`
is an alternative escape hatch but pulls in an unstable Deno flag for a non-Deno-code problem; bumping Playwright is cleaner.

After bumping, wipe stale local `node_modules/` under each e2e-browser directory — `deno cache --node-modules-dir` re-uses an
existing layout if it finds one, so the old 1.58.2 entries persist until you delete them.

## Svelte SSR Build Issue

When Svelte app shows blank page with error: `` `mount(...)` is not available on the server ``

**Root cause**: Svelte's package.json exports map has `"browser": "./src/index-client.js"` and
`"default": "./src/index-server.js"`. Vite under Deno resolves to `"default"` (server).

**Fix**: Add to vite.config.ts:

```ts
resolve: {
  conditions: ["browser", "import", "module", "default"],
},
```

## Build Caching Gotcha

The `cp -r dist ../dist/web` task doesn't clean the destination first. Stale asset files persist. Always `rm -rf` the destination
before copying, or verify the served HTML references the current bundle hash.

## Pin Both `imports` AND the Runner Version

A common trap: the nested `e2e-browser/deno.json` pins `@playwright/test` to a specific version in `imports`, but the `test` task
still invokes `npm:@playwright/test@latest/cli`. The two can drift — when npm publishes a new minor (e.g. 1.59 → 1.60) the CLI
starts looking for a chromium revision that wasn't installed by `playwright:install` (which is pinned). The result is "Executable
doesn't exist at .../chrome-headless-shell" mid-test.

**Fix**: pin the runner version in the task too:

```json
"test": "deno task prepare && deno run -A npm:@playwright/test@1.60.0/cli test"
```

Same version everywhere — `imports`, the `test` task, and `playwright:install`.

## Nested deno.json Doesn't Inherit Parent Imports

When the e2e-browser directory has its own `deno.json` and the spec/fixtures import from `../../../src/foo.ts` which itself
imports a workspace alias like `wallet-signer-core`, Deno resolves the config from the nested directory and **does not** walk up
to the parent's import map. Imports defined only at the parent level fail to resolve with
`Import "X" not a dependency and not in import map`.

**Fix**: duplicate the workspace import in the nested `deno.json`:

```json
"imports": {
  "@playwright/test": "npm:@playwright/test@1.60.0",
  "wallet-signer-core": "../../../wallet-signer-core/src/mod.ts"
}
```

## Workspace + nodeModulesDir

If you declare a Deno `workspace` at the repo root, `nodeModulesDir` must live in the root config only — member `deno.json` files
emit a warning if they set it. Move all `"nodeModulesDir": "auto"` lines to the root.

## Working deno.json Pattern

```json
{
  "tasks": {
    "prepare": "deno cache --node-modules-dir playwright.config.ts spec-file.spec.ts",
    "test": "deno task prepare && deno run -A npm:@playwright/test@1.60.0/cli test"
  },
  "imports": {
    "@playwright/test": "npm:@playwright/test@1.60.0"
  }
}
```

Plus `package.json` in same directory: `{"type": "commonjs"}`
