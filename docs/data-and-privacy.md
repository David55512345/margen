# Data, privacy and backups

Publishing or cloning this repository does **not** publish or recover a user's books. Code and reading data are separate.

| Location | May contain | Important limit |
| --- | --- | --- |
| Browser IndexedDB/localStorage | Cached EPUBs, settings, indexes, drafts and reading state | Specific to browser/profile/origin; clearing site data can remove it |
| Local `.wrangler/state` | Emulated D1 records and R2 books | Separate from a hosted account; never commit it |
| Hosted D1/R2 | Books and synchronized account data | Requires the operator's trusted authentication boundary |
| User-selected Margen folder | EPUBs, annotations, study data, chats and board copies | Written while the app is open and has permission; not encrypted by Margen |

The folder includes `margen.json`, `configuracion.json` and per-book `libros/<id>/libro.epub` and `datos.json`. A previous data copy can be retained during replacement. Recovery preserves provenance where possible and avoids replacing newer edits with older ones. This is not unlimited version history or a substitute for independent backups.

## AI and speech

When AI is configured and requested, selected text, relevant context, questions or study answers can be sent to OpenAI. Chapter analysis may send chapter text. Context budgets and `store: false` do not mean that no data leaves the computer or that all provider retention is disabled.

Speech synthesis and dictation depend on the browser, OS and provider. Some voices and recognition services use the network. Microphone permission is browser-controlled. Margen does not bundle a guaranteed offline voice model.

## Sharing precautions

- Use original or clearly redistributable text for screenshots, issues and demos.
- Never share your reading folder, database, browser export or secret configuration in Git.
- A public code repository is not a backup destination for copyrighted books or private notes.
- Keep independent backups before importing old copies or changing storage code.

Desktop folder access and mobile support differ. A PC folder does not automatically become available on a phone. Hosted synchronization and explicit refresh are separate mechanisms.
