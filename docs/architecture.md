# Architecture and compatibility

Initial decision, 2026-09-13. AI assistance: Codex.

One npm package contains the library and CLI. `src/client.ts` adapts the REST API,
`src/auth.ts` handles authentication, and `src/session.ts` handles transport, cookies
and redirects. The CLI lives in `src/cli.ts`, with its entry point in `src/bin.ts`.

The client uses Node's native `fetch` and TypeScript compiled with `tsc`, without
a bundler. `tough-cookie` implements cookie rules and `cheerio/slim` parses HTML
forms, avoiding custom cookie and attribute parsers. The package is ESM and Node-only.
It includes no plugin PHP source, institutional configuration or backup data.

Consumers own deployment selection and ordering. There is no generic provider layer,
server, UI, Git synchronization or telemetry. No application-specific WordPress
business rules belong in this client.

## Verified contract

The reference is Code Snippets 3.10.2 installed from WordPress.org, specifically
`php/REST_API/Snippets/Snippets_REST_Controller.php`. The development tree may change
before release: [upstream controller](https://github.com/codesnippetspro/code-snippets/blob/core-beta/src/php/REST_API/Snippets/Snippets_REST_Controller.php).

- Requests use `?rest_route=/code-snippets/v1/snippets`, supporting plain permalinks.
- Mutations use POST, accepted by `WP_REST_Server::EDITABLE`.
- In 3.10.2, activation/deactivation serialize the model as `{}`. A subsequent GET
  normalizes the result and verifies persisted state.
- Restoration returns HTTP 204; the client also fetches the snippet afterward.
- The first deletion trashes the snippet; the next permanently deletes it.
- HTTP 200 alone is not sufficient evidence of successful activation.

## Test boundaries

Local integration covers WordPress 7.1 / PHP 8.3 / Code Snippets 3.10.2, WordPress
login, application passwords, permissions and PHP snippet operations. Subsite routing
and network parameters are tested with HTTP simulations. Initial integration does
not demonstrate a real multisite network or Pro features.

CAS tests simulate forms and callbacks based on Cassify's flow. They have not run
against a production Apereo/Cassify deployment, MFA or every possible CAS theme.
Extend the relevant tests before claiming additional compatibility.
