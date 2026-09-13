# Changelog

## 0.1.3 — 2026-09-13

- Replace Cheerio with its existing htmlparser2 parser for login forms, removing
  15 transitive packages and the deprecated whatwg-encoding installation warning.
- Keep hidden-field decoding, form selection and cross-origin credential guards;
  add regression checks for disabled fields and password inputs outside forms.
- Stop Node from consuming the CLI's --env-file option before CLI validation,
  and exercise the npm launcher on Windows, macOS and Linux.
- Reject deprecated runtime dependencies in the installed-package check.

## [0.1.2] — 2026-09-13

- Start CAS login from the admin URL to avoid Cassify 2.4.9 callback cookie loops.
- Accept Code Snippets 3.9.6 responses without the optional trash-state field.
- Keep latest test-version lanes current through Renovate PRs, preserving the fixed baseline.
- Test WordPress/PHP/plugin compatibility and the fixed 6.9.5/3.9.6 baseline.
- Add an opt-in real Cassify 2.4.9 check against the public pac4j CAS server.

## [0.1.1] — 2026-09-13

- License the project under GPL-3.0-or-later.
- Publish to npm when a GitHub Release is published; attach the tested package.
- Add tokenless Codecov uploads, a coverage badge and a file coverage treemap.
- Require at least 90% project and patch coverage in Codecov.

## [0.1.0] — 2026-09-13

- Typed REST client: list, get, create, update, activate, deactivate, trash,
  restore and permanently delete snippets.
- Application passwords, WordPress login, existing sessions and CAS forms.
- CLI for PHP/JSON files, explicit write confirmation and JSON output for agents.
- Metadata preservation and single-use snippet safeguards.
- Unit, local HTTP, disposable WordPress and installed-package tests.
