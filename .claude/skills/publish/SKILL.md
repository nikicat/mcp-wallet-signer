---
name: publish
description: Publish a monorepo package to all its supported registries by bumping version, building, and creating a GitHub release
argument-hint: "[package] [patch|minor|major]"
---

Publish a package from this monorepo via GitHub release. The publish workflow always publishes to **all supported registries** for the package (see table below) — there is no way to select individual registries.

Arguments are optional and positional — any can be omitted:
- `package`: `mcp-wallet-signer`, `browser-evm-signer`, `browser-tron-signer`, or `wallet-signer-core`
- `bump`: `patch`, `minor`, or `major`

## Inferring missing arguments

When arguments are omitted, infer them from context:

1. **Package**: Run `git diff HEAD~3 --stat -- packages/` to find which package(s) changed recently. If exactly one, use it. If ambiguous, ask the user.
2. **Bump**: Recommend based on the diff (see step 2 below). Ask for confirmation.

## Package details

| Package | Dir | Version field in `deno.jsonc` | npm name | JSR name | Supported registries |
|---|---|---|---|---|---|
| mcp-wallet-signer | `packages/mcp-wallet-signer` | `npm.version` | `mcp-wallet-signer` | — | npm |
| browser-evm-signer | `packages/browser-evm-signer` | top-level `version` | `browser-evm-signer` | `@nikicat/browser-evm-signer` | npm, jsr |
| browser-tron-signer | `packages/browser-tron-signer` | top-level `version` | `browser-tron-signer` | `@nikicat/browser-tron-signer` | npm, jsr |
| wallet-signer-core | `packages/wallet-signer-core` | top-level `version` | `wallet-signer-core` | `@nikicat/wallet-signer-core` | npm, jsr |

### First publish of a new package

New npm packages need a one-time manual bootstrap before the GitHub-Actions OIDC flow works. For the very first publish of a new package:

1. Build locally: `cd packages/<dir> && deno task build:npm`
2. From the user's shell: `cd packages/<dir>/npm && npm login && npm publish --provenance --access public` (interactive — user runs)
3. JSR (if applicable): `cd packages/<dir> && deno publish --allow-dirty`
4. Tag the commit and push, but **skip creating a GitHub release** for this initial version — the publish workflow would otherwise fire on `release: created` and fail because the version is already on the registry.
5. The next version bump (≥ 0.x.y+1) goes through the normal workflow flow below.

## Tag format

Tags use the monorepo convention: `<npm-name>@<version>` (e.g., `mcp-wallet-signer@0.4.1`, `browser-evm-signer@0.1.4`). The publish workflow parses the package name from the tag.

## Steps

### 1. Select package

Resolve package from arguments or inference (see above).

### 2. Detect existing state and determine version

Before doing any work, check what's already been done so the skill can resume a partial publish:

1. Read the current version from the package's `deno.jsonc` (see table above for which field).
2. Find the latest **released** tag: `git tag -l '<npm-name>@*' --sort=-v:refname | head -1`.
3. Check whether a tag for the current version already exists: `git tag -l '<npm-name>@<current-version>'`.
4. Check whether a GitHub release already exists: `gh release view <npm-name>@<current-version> 2>&1`.
5. Check whether the package is already published:
   - npm: `npm view <npm-name> version`
   - JSR (if applicable): `deno info jsr:<jsr-name>@<current-version>`

Based on this state, determine the resume point:

| Tag exists? | Release exists? | Published? | Action |
|---|---|---|---|
| No | — | — | Need to bump version, tag, and publish (full flow from step 3) |
| Yes (local only) | No | No | Push tag, then continue from step 5 (CI) |
| Yes (remote) | No | No | Continue from step 5 (CI) |
| Yes (remote) | Yes | No | Continue from step 7 (wait for publish workflow) |
| Yes (remote) | Yes | Yes | Already fully published — inform user and stop |

**If a full flow is needed (no tag for current version):**

1. Run `git log <latest-tag>..HEAD --oneline -- packages/<package-dir>` to get commits since the last release.
2. If there are no commits, inform the user there's nothing new to publish and stop.
3. Recommend a bump type based on the commits:
   - **patch**: bug fixes, formatting, docs, dependency bumps, CI changes
   - **minor**: new features, new API surface, new tools/commands
   - **major**: breaking changes to public API, removed exports, changed behavior
4. Show the user: the commit list, your recommended bump type with reasoning, and the resulting version. Ask for confirmation.

### 3. Build the npm package (smoke test)

Skip this step if resuming past it.

Run from the package directory:
```
cd packages/<package-dir> && deno task build:npm
```

Verify the build succeeds before continuing.

### 4. Commit, tag, and push

Skip steps that are already done (e.g., if tag already exists, don't re-create it).

1. Bump the version in `packages/<package-dir>/deno.jsonc`.
2. **If publishing `mcp-wallet-signer`**: also bump both `version` fields in the root `server.json` (top-level and `packages[0].version`).
3. Stage and commit changed files with message: `Bump <npm-name> version to <new-version>`
4. Create a git tag: `<npm-name>@<new-version>`
5. Push commit and tag: `git push && git push --tags`

**Important**: Always verify the tag is on the remote before proceeding. If the tag exists locally but not on the remote, push it with `git push --tags`.

### 5. Wait for CI checks

Wait for the CI workflow to pass on the pushed commit using `gh run watch $(gh run list --workflow=ci.yml --limit=1 --json databaseId --jq '.[0].databaseId')` with a timeout of 5 minutes.

If CI fails, show the logs with `gh run view <run-id> --log-failed` and **stop** — do not create a release with failing checks.

### 6. Create GitHub release

Run:
```
gh release create <npm-name>@<new-version> --title "<npm-name>@<new-version>" --generate-notes
```

This triggers the `publish.yml` GitHub Actions workflow which parses the package name from the tag, builds, and publishes to all supported registries:
- **npm job**: always runs — builds with `deno task build:npm` and publishes with `npm publish --provenance`
- **jsr job**: runs only for packages with `jsr: true` in the workflow (currently `browser-evm-signer`, `browser-tron-signer`, `wallet-signer-core`)

### 7. Wait for publish workflow

Get the run ID from `gh run list --workflow=publish.yml --limit=1` and watch it with `gh run watch <run-id>`. Use a timeout of 5 minutes.

If the workflow fails, show the logs with `gh run view <run-id> --log-failed` and stop.

### 8. Verify published packages

Check all supported registries for the package:

- **npm**: Run `npm view <npm-name> version` and confirm the output matches `<new-version>`.
- **JSR** (if package supports it): Run `deno info jsr:<jsr-name>@<new-version>` to verify.
- If any check fails, warn the user.
