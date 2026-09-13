# Agent instructions

A TypeScript library and Node.js CLI for the WordPress **Code Snippets** plugin.
GPL-3.0-only. This is neither a WordPress plugin nor the WPCode product.

- Write all code, identifiers, comments, documentation, commits and user-facing text in English.
- Use strict TypeScript and two spaces. `npm run format` applies formatting.
- Use English branch names prefixed with `feature/` or `hotfix/`.
- The library receives configuration. It never discovers `.env`, writes backups or runs Git.
- The CLI loads only an explicit `--env-file`. Never publish credentials, cookies,
  CAS responses, institutional URLs or fixtures copied from production.
- Verify operations against real plugin source. A mock must not define the API.
- CAS: preserve cookies and hidden fields; validate origins before sending passwords.
  WordPress/Cassify validates tickets. Do not implement a CAS server or bypass MFA.
- Never implicitly rearm `single-use` or retry creations/deletions with uncertain outcomes.
- Do not add providers for other plugins or a UI without an actual consumer.

Before release: `npm ci`, `npm run check`, `npm run test:package` and
`npm run test:integration` with Docker. Write tests use only the disposable
WordPress in `.wp-env.json`, never user sites.

Release tags are `v` plus the exact `package.json` version, after CI passes.
`publish.yml` uses npm Trusted Publishing (OIDC), environment `npm`, without committed
tokens. Publish the same tarball installed by the package test. Never replace a
published release. Record changes in CHANGELOG.md.

Architecture and boundaries: `docs/architecture.md`. Authentication: `docs/authentication.md`.
