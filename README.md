# Margen

**Read, listen, annotate and turn your EPUBs into connected knowledge.**

[Español](docs/README.es.md) · [Contributing](CONTRIBUTING.md) · [Data & privacy](docs/data-and-privacy.md) · [Roadmap](docs/roadmap.md)

![Margen — lectura inteligente](public/og.png)

Margen is a Spanish-first reading and study workspace built around your own EPUB files. It brings contextual notes, flashcards, browser speech and a visual knowledge board into the same reading flow. An optional OpenAI-backed assistant works from the selected passage and relevant book context.

**Status: early public release.** Built and iterated for an individual reading workflow; broader browser, accessibility and multi-user testing are ongoing. This repository publishes the application code, not anyone's books, annotations, accounts or private deployment.

## What you can do

- **Stay in the book:** paginated or scrolling layouts, themes, text scaling and conflict-checked shortcuts. Floating notes avoid opening the sidebar; panel resizing preserves the reading anchor.
- **Listen and dictate:** browser-provided voices, pause/resume/stop, speed and volume controls, speech commands and answer dictation where supported.
- **Annotate with context:** highlights, editable notes and flashcards linked to an EPUB passage; manual or explicitly requested AI assistance.
- **Practice what you read:** chapter activities, Feynman explanations, retry controls, flashcard review and Anki-compatible CSV export.
- **Connect ideas:** place notes and flashcards on a board. Conversions create a new item and retain the original plus its provenance link.
- **Keep portable copies:** connect a local data folder in supported desktop browsers. The hosted edition can sync a private library across devices through D1/R2.

## Run locally

Requires **Node.js 22.13+**, npm and a current browser. The default setup uses local Cloudflare D1/R2 emulation; no Cloudflare account or OpenAI key is required for the initial trial.

```sh
git clone https://github.com/David55512345/margen.git
cd margen
npm ci
npm run db:local
npm run dev
```

Open the local address printed by the server (normally `http://127.0.0.1:3000`). Keep using the same address and port: browser data and permissions are origin-specific.

For a small **original test EPUB**, with no copyrighted book included:

```sh
npm run demo:epub
```

Import the EPUB at the temporary path printed by that command. Select a passage to make a note, try a flashcard, then reopen the reader to check persistence.

### Optional AI

Create an ignored `.dev.vars` file with your own **server-side** settings:

```dotenv
OPENAI_API_KEY=your-own-api-key
OPENAI_MODEL=gpt-5.6-luna
```

Model access depends on your API account; choose a compatible Responses API model. API usage may cost money and is separate from a ChatGPT subscription. Never put a key in `NEXT_PUBLIC_*` variables or browser code. Without a key, Margen uses a limited deterministic fallback, not a generative AI model.

Speech voices, dictation and folder access depend on your browser and operating system. Browser-provided speech can use remote services; it is **not guaranteed offline**.

## Local versus hosted

| Area | This local setup | Protected hosted edition |
| --- | --- | --- |
| Identity | One fixed development user | Trusted Sites gateway identity |
| Database / books | Local emulation in `.wrangler/state` | Operator-managed D1 and private R2 |
| Browser copies | IndexedDB / localStorage for this origin | Also origin-specific |
| Portable folder | User-selected, with permission | User-selected, with permission |
| Device sync | No automatic connection to a hosted account | Same authenticated account on each device |

**Do not expose the development server to the internet or use GitHub Pages for the full application.** It has server routes, a database and optional paid AI calls. A default production build does not enable data APIs until a protected hosting integration is configured. See [development and hosting boundaries](docs/development.md).

## Quality and contributions

```sh
npm test                 # build + regression tests
npm run check:public     # audit tracked files for common accidental disclosures
npm run lint             # legacy code-style/accessibility audit; see known limits
```

Tests cover assistant intent and context, folder recovery, annotation provenance, keyboard conflicts, reading anchors and local-access boundaries. Some UI checks are source-level assertions, not full browser end-to-end tests. CI runs the build and regression suite on pull requests. The public-source check is a safeguard, **not a complete security audit**.

We welcome reproducible bugs, small fixes, accessibility improvements and documentation in English or Spanish. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Use synthetic or redistributable sample text, never private books or credentials, in reports.

## Project stewardship

Maintained by [David55512345](https://github.com/David55512345). Margen was developed with AI coding assistance; contributions still need human review and passing tests. Opening the source is a starting point for community use, not a claim of established adoption or external endorsement.

## License

[MIT](LICENSE) for Margen's original code. Dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). Imported books and user annotations are not licensed or distributed by this repository.
