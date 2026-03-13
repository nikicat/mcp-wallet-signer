---
name: publish-npm
description: Publish a monorepo package to npmjs by bumping version, building, and creating a GitHub release
argument-hint: "[package] [patch|minor|major]"
---

Publish a package from this monorepo to npmjs via GitHub release.

Arguments are optional and positional:
- `package`: `mcp-wallet-signer` or `browser-evm-signer` (if omitted, ask the user)
- `bump`: `patch`, `minor`, or `major` (if omitted, recommend one based on the diff)

## Package details

| Package | Dir | Version field in `deno.jsonc` | npm name | JSR name | Registries |
|---|---|---|---|---|---|
| mcp-wallet-signer | `packages/mcp-wallet-signer` | `npm.version` | `mcp-wallet-signer` | — | npm only |
| browser-evm-signer | `packages/browser-evm-signer` | top-level `version` | `browser-evm-signer` | `@nikicat/browser-evm-signer` | npm + JSR |

## Tag format

Tags use the monorepo convention: `<npm-name>@<version>` (e.g., `mcp-wallet-signer@0.4.1`, `browser-evm-signer@0.1.4`). The publish workflow parses the package name from the tag.

## Steps

### 1. Select package

If not provided as argument, ask the user which package to publish.

### 2. Analyze changes and bump version

1. Read the version from the package's `deno.jsonc` (see table above for which field).
2. Find the latest tag for this package: `git tag -l '<npm-name>@*' --sort=-v:refname | head -1`. If no tag exists, use all history.
3. Run `git log <tag>..HEAD --oneline -- packages/<package-dir>` to get commits touching this package since the last release.
4. Based on the commits and diff, recommend a bump type:
   - **patch**: bug fixes, formatting, docs, dependency bumps, CI changes
   - **minor**: new features, new API surface, new tools/commands
   - **major**: breaking changes to public API, removed exports, changed behavior
5. Show the user: the commit list, your recommended bump type with reasoning, and the resulting version. Ask for confirmation, offering all three bump types as options with your recommendation marked.

### 3. Build the npm package (smoke test)

Run from the package directory:
```
cd packages/<package-dir> && deno task build:npm
```

Verify the build succeeds before pushing.

### 4. Commit, tag, and push

1. Bump the version in `packages/<package-dir>/deno.jsonc`.
2. **If publishing `mcp-wallet-signer`**: also bump both `version` fields in the root `server.json` (top-level and `packages[0].version`).
3. Stage and commit changed files with message: `Bump <npm-name> version to <new-version>`
4. Create a git tag: `<npm-name>@<new-version>`
5. Push commit and tag: `git push && git push --tags`

### 5. Wait for CI checks

Wait for the CI workflow to pass on the pushed commit using `gh run watch $(gh run list --workflow=ci.yml --limit=1 --json databaseId --jq '.[0].databaseId')` with a timeout of 5 minutes.

If CI fails, show the logs with `gh run view <run-id> --log-failed` and **stop** — do not create a release with failing checks.

### 6. Create GitHub release

Run:
```
gh release create <npm-name>@<new-version> --title "<npm-name>@<new-version>" --generate-notes
```

This triggers the `publish.yml` GitHub Actions workflow which parses the package name from the tag, builds, and publishes to npm with provenance. For `browser-evm-signer`, it also publishes to JSR.

### 7. Wait for publish workflow

Get the run ID from `gh run list --workflow=publish.yml --limit=1` and watch it with `gh run watch <run-id>`. Use a timeout of 5 minutes.

If the workflow fails, show the logs with `gh run view <run-id> --log-failed` and stop.

### 8. Verify published packages

1. Run `npm view <npm-name> version` and confirm the output matches `<new-version>`.
2. **If publishing `browser-evm-signer`**: also run `deno info jsr:@nikicat/browser-evm-signer@<new-version>` to verify the JSR publish.
3. If either check fails, warn the user.
