# Coding Conventions

## Runtime & Tooling

- **Runtime**: Deno (primary). The npm bundle must also run under Node.js.
- **Use `deno task`** for all operations (build, test, lint, fmt). Never use `npm`/`npx`.
- **No shebangs** in TypeScript source files — causes recursive process spawning under Deno.
- **Node compatibility**: Source code uses `node:` builtins (not Deno-specific APIs) so the esbuild bundle works in both runtimes. Deno's `deno.window` lib is available for tests.

## Formatting & Linting

Enforced by `deno fmt` and `deno lint` — see `deno.json` for config.

- 2-space indentation, no tabs
- Double quotes
- 130-character line width
- Lint ruleset: `recommended`
- Run `deno task lint` and `deno fmt --check src/ tests/` before committing

## TypeScript

- **Strict mode** enabled (`"strict": true` in `compilerOptions`)
- **Explicit `.ts` extensions** on all relative imports: `import { foo } from "./bar.ts"`
- **`node:` prefix** on all Node builtins: `import { readFile } from "node:fs/promises"`
- **`import type`** for type-only imports: `import type { AddressInfo } from "node:net"`
- **Zod schemas** for external input validation (MCP tool args, API bodies). Pair each schema with a TypeScript interface in `types.ts`.
- Prefer `interface` for object shapes, `type` for unions and aliases

## Naming

| Thing               | Convention         | Example                          |
|---------------------|--------------------|----------------------------------|
| Files               | `kebab-case.ts`    | `pending-store.ts`               |
| Functions           | `camelCase`        | `ensureServerRunning()`          |
| Types / Interfaces  | `PascalCase`       | `SendTransactionRequest`         |
| Module constants    | `UPPER_SNAKE_CASE` | `DEFAULT_PORT`, `REQUEST_TIMEOUT_MS` |
| Local variables     | `camelCase`        | `serverPort`                     |
| Private fields      | leading underscore  | `_store`                         |

Functions use verb-first naming: `get*`, `create*`, `build*`, `handle*`, `ensure*`.

## File Structure

Within a source file, order items top-to-bottom:

1. Imports (node builtins, then third-party, then relative — separated by blank line)
2. Module-level constants
3. Helper/utility functions (private)
4. Main class or primary exports
5. Singleton instance / entry-point export

Within a class: public fields, public methods, then private methods.

## Error Handling

- **Zod `.safeParse()`** at API boundaries — return structured errors, don't throw
- **Try-catch with graceful fallback** for I/O (file reads, browser open) — log and continue
- **`error instanceof Error ? error.message : String(error)`** for unknown error narrowing
- Don't swallow errors silently; at minimum `console.error` with a `[mcp-wallet-signer]` prefix

## Exports

- Named exports only — no default exports (except Svelte components in `web/`)
- Singletons exported as `const`: `export const pendingStore = new PendingStore()`
- Factory functions for complex objects: `export function createMcpServer(): Server`

## Testing

- **Deno.test** with object config for tests that need `sanitizeResources: false` / `sanitizeOps: false`
- Simple `Deno.test("name", async () => { ... })` for pure-logic tests
- Assertions from `https://deno.land/std@0.224.0/assert/mod.ts`: `assertEquals`, `assertExists`, `assertRejects`
- Cleanup in `finally` blocks (stop servers, cancel pending requests)
- Browser e2e tests use Playwright via `deno run -A npm:@playwright/test@latest/cli`
- **`.mts` extension** for fixture modules imported by Playwright specs. The e2e-browser directory has `"type": "commonjs"` in `package.json` (required for Playwright under Deno — see `deno-playwright.md`), so shared modules must use `.mts` to be treated as ESM. Spec files themselves stay `.spec.ts`.

## HTTP Server

- Bind to `127.0.0.1` only — never expose to all interfaces
- Use `node:http` `createServer` (not `Deno.serve`) for Node.js compatibility
- Handler functions return web-standard `Response` objects; a thin adapter writes them to Node's `ServerResponse`

## Debugging & Problem-Solving

- **Always pursue the root cause.** When something breaks, dig until you understand *why* — don't jump to workarounds. Exhaust every avenue of investigation first: read source code, check types, reproduce minimally, bisect.
- **Workarounds are a last resort**, only after the root cause is understood and a proper fix is impractical (upstream bug, runtime limitation, etc.). When a workaround is used, document *why* the proper fix isn't possible.

## Comments

- **JSDoc** (`/** */`) on exported functions and classes
- **Inline comments** for non-obvious logic — not for restating what the code does
- No `@param`/`@returns` tags when types make them redundant
