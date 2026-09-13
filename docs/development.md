# Development and releases

Requirements: Node >=22.14, npm, and Docker for integration tests. `npm run` commands
also work through an agent on Windows; the Makefile is an optional shortcut.

```sh
npm ci
npm run check
npm run test:package
npm run test:integration
```

`check` runs formatting, strict TypeScript, Vitest with coverage and compilation.
HTTP tests use ephemeral loopback servers. `test:package` creates a tarball, validates
its file allowlist, installs it in a temporary directory and tests the installed
import and CLI. Run `npm run build` first when invoking the package test separately.
CI retains coverage reports as artifacts.

`test:integration` starts `.wp-env.json`, exercises CRUD, metadata, activation,
double evaluation, permissions, application passwords and single-use snippets. It
cleans up its snippets and stops the environment in `finally`. It never reads a
`WP_URL` environment variable. Ports are 8896 and 8897. `npm run wp:destroy` removes
this disposable environment.

Runtime and development dependencies are pinned with a lockfile. Overrides for
`qs`, `ws` and `ajv` fix transitive WordPress environment dependencies; remove them
once upstream resolves patched versions without overrides.

## Releases

1. Update the version and CHANGELOG. Run every check.
2. Merge into `main` with passing CI.
3. Create and push a tag named `v` followed by the exact package version.
4. `publish.yml` repeats CI, installs and verifies the package, publishes that exact
   tarball to npm and attaches it to a GitHub Release.

There is no per-commit publication or secondary registry: npm and GitHub Releases
cover installation and artifact downloads. Never reuse a published version number.

The workflow uses npm Trusted Publishing (OIDC). Configure these values in npm:

- Repository: `erseco/code-snippets-client`.
- Workflow: `publish.yml`.
- Environment: `npm`.

A new package may require an authenticated first publication before configuring its
trusted publisher. Never add an npm token to the repository or workflow. A repeated
publication only succeeds when that version has an identical tarball checksum;
different contents cause a failure.
