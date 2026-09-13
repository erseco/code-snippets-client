# Architecture and compatibility

Initial decision, 2026-09-13. AI assistance: Codex.

One npm package contains the library and CLI. `src/client.ts` adapts the REST API,
`src/auth.ts` handles authentication, and `src/session.ts` handles transport, cookies
and redirects. The CLI lives in `src/cli.ts`, with its entry point in `src/bin.ts`.

The client uses Node's native `fetch` and TypeScript compiled with `tsc`, without
a bundler. `tough-cookie` implements cookie rules and `htmlparser2` parses HTML
forms, avoiding custom cookie and attribute parsers. The package is ESM and Node-only.
It includes no plugin PHP source, institutional configuration or backup data.

Consumers own deployment selection and ordering. There is no generic provider layer,
server, UI, Git synchronization or telemetry. No application-specific WordPress
business rules belong in this client.

## Verified contract

The references are Code Snippets 3.9.6 and 3.10.2 installed from WordPress.org.
The 3.9.6 controller is `php/rest-api/class-snippets-rest-controller.php`; 3.10.2 uses
`php/REST_API/Snippets/Snippets_REST_Controller.php`. The development tree may change
before release: [upstream controller](https://github.com/codesnippetspro/code-snippets/blob/core-beta/src/php/REST_API/Snippets/Snippets_REST_Controller.php).

- Requests use `?rest_route=/code-snippets/v1/snippets`, supporting plain permalinks.
- Mutations use POST, accepted by `WP_REST_Server::EDITABLE`.
- In 3.10.2, activation/deactivation serialize the model as `{}`. A subsequent GET
  normalizes the result and verifies persisted state.
- In 3.10.2, restoration returns HTTP 204; the client fetches the snippet afterward.
  The first deletion trashes the snippet; the next permanently deletes it.
- In 3.9.6, `trashed` is absent, DELETE only trashes and returns HTTP 204, and the
  REST restore route does not exist. The client preserves that distinction.
- HTTP 200 alone is not sufficient evidence of successful activation.

## Test boundaries

The required WordPress/PHP/plugin matrix is documented in the [development guide](development.md).
It covers native login, application passwords, permissions and PHP snippet operations.
Subsite routing and network parameters are tested with HTTP simulations; this does
not demonstrate a real multisite network or Pro features.

CAS unit tests simulate forms and callbacks. The opt-in external integration uses
Cassify 2.4.9, WordPress 6.9.5 and Code Snippets 3.9.6 against the public pac4j CAS
server. It covers ticket validation, admin cookies, REST nonce retrieval and API
operations, including the need to start from the admin URL. Production CAS policies,
MFA, logout/SLO and arbitrary CAS themes remain outside that check.
