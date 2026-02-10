# Project Instructions

## Coding Conventions
Read and follow [CONVENTIONS.md](CONVENTIONS.md) for all code style, naming, and patterns.

## Deno + Playwright Setup
See [deno-playwright.md](deno-playwright.md) for hard-won lessons about running Playwright under Deno.

## Key Rules
- **Always use Deno** (`deno task`, `deno run`), never npm/npx for running tools or installing deps
- **Never put shebangs** (`#!/usr/bin/env deno`) in TypeScript source files — causes recursive process spawning
- **No Deno-specific APIs** in `src/` — use `node:` builtins so the npm bundle runs under Node.js
- Reference project: `~/src/secrets-dispatcher/web` for Deno+Playwright patterns
