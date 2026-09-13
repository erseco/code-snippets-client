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
CI uploads LCOV to Codecov using GitHub OIDC, without a stored upload token, and
retains coverage reports as artifacts. Codecov requires at least 90% project and
patch coverage. Vitest independently enforces 95% lines, statements and functions,
and 90% branches, so coverage remains enforced even without Codecov. Connect this
repository to the Codecov GitHub App to display coverage checks on pull requests.

`test:integration` starts `.wp-env.json`, exercises CRUD, metadata, activation,
double evaluation, permissions, application passwords and single-use snippets. It
cleans up its snippets and stops the environment in `finally`. It never reads a
`WP_URL` environment variable. Ports are 8896 and 8897. `npm run wp:destroy` removes
this disposable environment.

## Compatibility tests

Required CI runs 14 WordPress jobs: the latest pinned patches of WordPress 6.9,
7.0 and 7.1 with PHP 8.3/8.4 and Code Snippets 3.9.6 plus the latest pinned
plugin release, as well as the fixed
WordPress 6.9.5 / Code Snippets 3.9.6 baseline on both PHP versions. The baseline
must not be advanced automatically when newer patches become available.

The integration harness accepts `WP_ENV_CORE` and `WP_ENV_PHP_VERSION` through
wp-env, and `TEST_CODE_SNIPPETS_VERSION` to select a specific plugin release before wp-env mounts it. It generates an
ignored `.wp-env.integration.json` without changing the checked-in configuration.
It prints the actual installed versions before exercising the API.

Renovate checks official upstream Git tags weekly and opens update PRs for the
annotated matrix entries and `.wp-env.json`. WordPress updates stay within each
6.9/7.0/7.1 branch; adding a new branch is an explicit support decision. Stable
Code Snippets releases update the latest-version lane. The fixed baseline and
`.wp-env.cas.json` are excluded. PHP 8.3/8.4 image tags resolve to current patches
when wp-env prepares fresh CI containers. Dependabot continues managing npm and
GitHub Actions; Renovate only manages these custom compatibility versions.

## Public CAS integration

```sh
npm run build
npm run test:cas
```

This opt-in test uses `.wp-env.cas.json`: WordPress 6.9.5, Code Snippets 3.9.6,
Cassify 2.4.9, PHP 8.3 and port 8910. `WP_ENV_PHP_VERSION=8.4` selects PHP 8.4.
The **Public CAS integration** workflow runs both PHP versions when started
manually from GitHub Actions. It is deliberately not a release prerequisite:
the public test server is an external service with independent availability.

The test creates a random local administrator with a random WordPress password.
The public CAS server accepts the same username with its documented test password
`password`. Cassify validates the ticket through `/p3/serviceValidate` with TLS
certificate verification enabled. The client must obtain WordPress cookies and a
REST nonce, then manage an inactive test snippet. A wrong CAS password must fail.
Cleanup removes the snippet and local account and stops the separate environment.
No production credentials, sites, user data or CAS ticket fixtures are used.

Runtime and development dependencies are pinned with a lockfile. Overrides for
`qs`, `ws` and `ajv` fix transitive WordPress environment dependencies; remove them
once upstream resolves patched versions without overrides.

## Releases

1. Update the version and CHANGELOG. Run every check.
2. Merge into `main` with passing CI.
3. Publish a GitHub Release from `main`. Both its title and its new tag must be
   exactly `v` followed by the package version, for example `v0.1.1`. GitHub creates
   the tag when you publish the release.
4. The `release: published` event starts `publish.yml`, which repeats CI, installs
   and verifies the package, publishes that exact tarball to npm and attaches it
   to the existing release. Pushing a tag alone does not publish to npm.

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
