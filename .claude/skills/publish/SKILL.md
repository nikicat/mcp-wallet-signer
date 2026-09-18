---
name: publish
description: Publish one of this repo's shim packages to npm by bumping its version and creating a GitHub release
argument-hint: "[package] [patch|minor|major]"
---

Publish a package from this repo via GitHub release. Everything here is a compatibility shim over
[browser-web3-signer](https://github.com/nikicat/browser-web3-signer) — releases should be rare,
and only to keep an existing install working.

Arguments are optional and positional:
- `package`: `mcp-wallet-signer`, `browser-evm-signer`, or `browser-tron-signer`
- `bump`: `patch`, `minor`, or `major`

Infer a missing `package` from `git diff HEAD~3 --stat -- packages/`; if ambiguous, ask.

## Steps

1. Bump `version` in `packages/<package>/package.json` (and `version` + `packages[0].version` in
   the root `server.json` for `mcp-wallet-signer`, which the MCP registry reads).
2. `npm test` at the repo root — builds every package and runs each one's tests.
3. Commit, push, then `gh release create <package>@<version> --title <package>@<version> --notes …`.
   The `publish.yml` workflow parses the tag, checks the version matches the package.json, and
   publishes that one workspace.

## npm auth

**Trusted publishing (OIDC) — there are no tokens in this repo.** Each package lists provider
`GitHub Actions`, owner `nikicat`, repo `mcp-wallet-signer`, workflow `publish.yml`, environment
blank, under its npmjs.com "Access → Trusted Publishers". `npm publish --provenance` in the
workflow authenticates through `id-token: write` and npm generates the provenance attestation.

Renaming `publish.yml` breaks this — update the trusted publisher on npmjs.com first, or the
publish fails with `ENEEDAUTH`.

## JSR

`browser-evm-signer` and `browser-tron-signer` used to publish to JSR as
`@nikicat/browser-*-signer`. The shims are npm-only; the JSR packages are frozen at their last
Deno release.
