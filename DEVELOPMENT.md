# Development

## Requirements

- Node.js 22+
- Codex, Claude Code, or both

## Run locally

```bash
npm install
npm run dev
```

The web app and local server reload while you edit source files.

## Checks

```bash
npm test
npm run typecheck
npm run build
```

Read [TECHNICAL_DESIGN.md](./TECHNICAL_DESIGN.md) for the architecture, data model, provider behavior, and current boundaries.

## Publish to npm

The [`Publish to npm`](./.github/workflows/publish.yml) workflow runs when a GitHub Release is published.

1. Create an npm granular access token that can publish `takotrace`.
2. Add it to the GitHub repository as an Actions secret named `NPM_TOKEN`.
3. Update `version` in `package.json` and `package-lock.json` with `npm version <patch|minor|major> --no-git-tag-version`.
4. Commit and push the version change.
5. Create a GitHub Release whose tag is exactly `v<version>`, for example `v0.1.0`.

The workflow rejects mismatched tags, runs the full verification suite, builds the package, and publishes it with npm provenance.
