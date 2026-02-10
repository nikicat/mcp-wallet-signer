# Project Memory

## Deno + Playwright Setup
See [deno-playwright.md](deno-playwright.md) for hard-won lessons about running Playwright under Deno.

## User Preferences
- **Always use Deno**, never npm/npx for running tools or installing deps
- **Never put shebangs** (`#!/usr/bin/env deno`) in TypeScript source files — causes recursive process spawning
- Reference project: `~/src/secrets-dispatcher/web` for Deno+Playwright patterns
