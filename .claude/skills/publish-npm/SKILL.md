---
name: publish-npm
description: Publish the package to npmjs by bumping version, building, and creating a GitHub release
argument-hint: "[patch|minor|major]"
---

Publish the mcp-wallet-signer package to npmjs via GitHub release.

The argument is the semver bump type: `patch` (default), `minor`, or `major`.

## Steps

### 1. Bump version in package.json

Read `package.json`, bump the `version` field according to the requested semver bump type (patch/minor/major), and write it back. Use standard semver rules:
- `patch`: 0.2.3 → 0.2.4
- `minor`: 0.2.3 → 0.3.0
- `major`: 0.2.3 → 1.0.0

Show the user the old and new version and ask for confirmation before proceeding.

### 2. Build the npm package (smoke test)

Run `deno task build:npm` to verify the build succeeds before pushing. This runs `scripts/build-npm.ts` which does the dnt transform and builds the web UI.

### 3. Commit, tag, and push

1. Stage and commit `package.json` with message: `Bump version to <new-version>`
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
