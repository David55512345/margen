# Development and hosting

## Stack and setup

React 19, TypeScript, vinext/Vite, epub.js, JSZip, Cloudflare Workers/D1/R2 emulation and Drizzle. This is a server-backed web app, not a static GitHub Pages site or a packaged desktop app.

1. Use Node 22.13+ (CI uses Node 22).
2. `npm ci` installs lockfile packages from the public npm registry.
3. `npm run db:local` applies committed migrations to local emulated D1.
4. `npm run dev` starts the reader on loopback. Use the printed URL.
5. `npm run demo:epub` creates an original EPUB in the OS temporary directory. Import it through the reader.

`.wrangler/state` contains emulator state. Back it up before database changes. The migration command always uses `--local`; it must not target a real cloud database. Do not share development data directories.

The Worker development entry point replaces incoming identity headers with `margen-local-development`. This is a local-only convenience, not multi-user authentication. Origins and cross-site browser requests are checked; keep the server bound to loopback. The local owner is not your Sites account.

## Optional AI

Use ignored `.dev.vars` for Cloudflare's local Worker secrets:

```dotenv
OPENAI_API_KEY=your-own-api-key
OPENAI_MODEL=gpt-5.6-luna
```

Restart after editing settings. The model must be available to your account and support the request shape in `app/ai/provider.ts`. Tests use mocks and need no key. Without a key the application uses a deterministic fallback with limited answer quality.

## Checks and known limits

- `npm test`: build + regression suite.
- `npm run test:unit`: suite against an already built `dist/server/index.js`.
- `npm run check:public`: inspect tracked files for forbidden reading-data artifacts and common credentials.
- `npm run lint`: legacy findings remain; not currently a green CI gate.
- Full `tsc --noEmit` is not a release gate yet: runtime-type and component findings need cleanup. A successful Vite build does not mean a clean standalone typecheck.

Tests include behavioral helpers, in-memory recovery checks, rendered-shell checks and source assertions. They do not replace manual EPUB/browser/voice testing.

## Hosting boundary

The original hosted edition runs behind a Sites gateway that authenticates users. Its private project identifier, storage contents, credentials and version history are **not** included here.

`vite.config.ts` can read an operator's ignored `.openai/hosting.json` for a genuine protected Sites deployment. Its presence enables hosted identity mode. This does not authenticate a worker directly exposed elsewhere. The gateway must replace client-supplied headers, protect every path and prevent origin bypass.

Without that configuration, `npm run build` and `npm start` produce a preview shell; data/API endpoints fail closed. Local functionality is available through `npm run dev`.

Portable production authentication, quotas/rate limits and reviewed multi-user deployment are roadmap items. Do not back a public demo with the maintainer's private account or API key. GitHub publication does not change an existing Sites instance's visibility.

## Layout

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | EPUB lifecycle, reader orchestration, voice and selection |
| `app/ai/` | Context, retrieval, provider calls, caching and persistence |
| `app/api/` | Library, annotations, learning state, synchronization and recovery |
| `app/*page.tsx`, `app/*panel.tsx` | Study tools, flashcards and knowledge board |
| `app/vault-*`, `app/local-*` | Portable folder and browser storage |
| `worker/` | Request boundary and Cloudflare entry point |
| `db/`, `drizzle/` | Schema and append-only migrations |
| `tests/` | Regression tests and original test-book generator |

Reader orchestration is still large. Extraction into smaller modules should preserve the user's layout and behavior.
