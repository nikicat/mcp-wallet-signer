# /publish-npm

Publish the mcp-wallet-signer package to npmjs via GitHub release.

## Usage

```
/publish-npm [patch|minor|major]
```

Defaults to `patch` if no bump type is specified.

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

### 5. Verify

Tell the user to check the publish status with:
```
gh run list --workflow=publish.yml --limit=1
```
