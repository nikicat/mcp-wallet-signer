---
name: publish-npm
description: Publish the package to npmjs by bumping version, building, and creating a GitHub release
argument-hint: "[patch|minor|major]"
---

Publish the mcp-wallet-signer package to npmjs via GitHub release.

The argument is an optional semver bump type: `patch`, `minor`, or `major`. If not provided, recommend one based on the diff (see step 1).

## Steps

### 1. Analyze changes and bump version

1. Read the `npm.version` field from `deno.jsonc` to get the current version.
2. Find the latest version tag with `git describe --tags --abbrev=0 --match 'v*'`.
3. Run `git log <tag>..HEAD --oneline` to get the commit list since that tag.
4. Based on the commits and diff, recommend a bump type:
   - **patch**: bug fixes, formatting, docs, dependency bumps, CI changes
   - **minor**: new features, new API surface, new tools/commands
   - **major**: breaking changes to public API, removed exports, changed behavior
5. Show the user: the commit list, your recommended bump type with reasoning, and the resulting version. Ask for confirmation, offering all three bump types as options with your recommendation marked.

### 2. Build the npm package (smoke test)

Run `deno task build:npm` to verify the build succeeds before pushing. This runs `scripts/build-npm.ts` which does the dnt transform and builds the web UI.

### 3. Commit, tag, and push

1. Bump version in `deno.jsonc` (`npm.version`) and `server.json` (top-level `version` and `packages[0].version`).
2. Stage and commit both files with message: `Bump version to <new-version>`
2. Create a git tag: `v<new-version>`
3. Push commit and tag: `git push && git push --tags`

### 4. Create GitHub release

Run:
```
gh release create v<new-version> --title "v<new-version>" --generate-notes
```

This triggers the `publish.yml` GitHub Actions workflow which builds and publishes to npm with provenance.

### 5. Wait for publish workflow

Get the run ID from `gh run list --workflow=publish.yml --limit=1` and watch it with `gh run watch <run-id>`. Use a timeout of 5 minutes.

If the workflow fails, show the logs with `gh run view <run-id> --log-failed` and stop.

### 6. Verify package on npmjs

Run `npm view mcp-wallet-signer version` and confirm the output matches `<new-version>`. If it doesn't, warn the user.
