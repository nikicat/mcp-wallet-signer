---
name: publish
description: Publish a monorepo package to all its supported registries by bumping version, building, and creating a GitHub release
argument-hint: "[package] [patch|minor|major]"
---

Publish a package from this monorepo via GitHub release. The publish workflow always publishes to **all supported registries** for the package (see table below) — there is no way to select individual registries.

Arguments are optional and positional — any can be omitted:
- `package`: `mcp-wallet-signer`, `browser-evm-signer`, or `browser-tron-signer`
- `bump`: `patch`, `minor`, or `major`

Note: `wallet-signer-core` is an internal-only monorepo package — it's inlined into both chain packages by dnt, so no consumer would install it directly from npm. Don't publish it.

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

### First publish of a new package

New npm packages need a one-time manual bootstrap before the GitHub-Actions OIDC flow works. For the very first publish of a new package:

1. Build locally: `cd packages/<dir> && deno task build:npm`
2. From the user's shell: `cd packages/<dir>/npm && npm login && npm publish --provenance --access public` (interactive — user runs)
3. JSR (if applicable): `cd packages/<dir> && deno publish --allow-dirty`
4. Tag the commit and push, but **skip creating a GitHub release** for this initial version — the publish workflow would otherwise fire on `release: created` and fail because the version is already on the registry.
5. **Authorize the GitHub workflow on each registry — do this immediately, even though the next release may be weeks away:**
   - **npm Trusted Publisher** (https://www.npmjs.com/package/&lt;npm-name&gt;/access → "Trusted Publishers"): add provider `GitHub Actions`, owner `nikicat`, repo `mcp-wallet-signer`, workflow `publish.yml`, environment blank.
     Without this, the workflow's `npm publish --provenance` fails with `ENEEDAUTH` — `secrets.NPM_TOKEN` is unset in this repo on purpose; the workflow relies entirely on OIDC.
   - **JSR linked repo** (https://jsr.io/&lt;jsr-name&gt;/settings → "GitHub repository"): set to `nikicat/mcp-wallet-signer`.
     Without this, `deno publish --allow-dirty` fails with `actorNotAuthorized`. Authorization is per-package — granting it for one package does **not** carry over to a sibling under the same scope.
6. The next version bump (≥ 0.x.y+1) goes through the normal workflow flow below.

### Bumping the chain-pkg dep range in `mcp-wallet-signer`

The MCP build remaps each chain-pkg `mod.ts` import to an npm dependency with a fixed version range — see `packages/mcp-wallet-signer/scripts/build-npm.ts`, in `mappings`. For pre-1.0 versions, **`^0.1.0` only matches `>=0.1.0 <0.2.0`**, so a chain minor bump (0.1.x → 0.2.0) leaves the MCP package pinned to the old major-zero band and `npx mcp-wallet-signer` keeps installing the stale version.

When publishing `mcp-wallet-signer` after a chain package's minor bump, also bump the range to the new band (e.g. `^0.1.0` → `^0.2.0`) and verify the built `npm/package.json` carries it before tagging:
```
grep -E '"browser-(evm|tron)-signer"' packages/mcp-wallet-signer/npm/package.json
```

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
- **jsr job**: runs only for packages with `jsr: true` in the workflow (currently `browser-evm-signer`, `browser-tron-signer`)

### 7. Wait for publish workflow

Get the run ID from `gh run list --workflow=publish.yml --limit=1` and watch it with `gh run watch <run-id>`. Use a timeout of 5 minutes.

If the workflow fails:
1. Show the logs with `gh run view <run-id> --log-failed`.
2. Common failure modes — diagnose before retrying:
   - `npm error code ENEEDAUTH` → trusted publisher missing on npm for this package. See "First publish of a new package" step 5 — same fix applies to a package that was bootstrapped manually but never wired up for CI.
   - `error: ... actorNotAuthorized` from `deno publish` → JSR repo authorization missing for this package.
3. Once the underlying auth/setup is fixed (ask the user to do this), resume the same run instead of cutting a new tag: `gh run rerun <run-id> --failed`. The GitHub release is already created, so a fresh push won't re-trigger anything.

### 8. Verify published packages

Check all supported registries for the package:

- **npm**: Run `npm view <npm-name> version` and confirm the output matches `<new-version>`.
- **JSR** (if package supports it): Do **not** use `deno info jsr:<jsr-name>@<new-version>` from inside the workspace — Deno resolves the JSR specifier to the local workspace member and reports the in-tree source, so the check always "passes" regardless of what's actually on the registry. Hit JSR's meta API directly instead:
  ```
  curl -s "https://jsr.io/<jsr-name>/meta.json" | python3 -c "import sys, json; print(list(json.load(sys.stdin).get('versions', {}).keys()))"
  ```
  Confirm `<new-version>` appears in the list.
- If any check fails, warn the user.
