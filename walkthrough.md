# Security Summary

**Reviewed Files**: 22
**Issues Resolved**: 8

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Raw HTML Rendering | `src/components/NotesDirectoryView.tsx` | 194 | Note HTML was rendered directly via `dangerouslySetInnerHTML` without allowlist sanitization. | High | Fixed | Replaced raw HTML injection with `SafeHtmlContent`, which parses HTML into a strictly allowlisted React element tree with zero event/script attributes. |
| Rich Editor HTML Ingestion & Paste | `src/components/RichNoteEditor.tsx` | 37 | Initial HTML, clipboard paste (`onPaste`), plain-text extraction, and saved HTML were written to `innerHTML` without sanitization. | High | Fixed | Enforced `sanitizarHtmlSeguro` on load, paste, and save, and replaced `tmp.innerHTML` with `DOMParser`-based `extrairTextoDeHtmlSeguro`. |
| Unvalidated JSON Backup & Prototype Keys | `src/db/database.ts`, `src/components/ExportView.tsx` | 508 | Imported JSON backups lacked size limits, prototype-key filtering, missing-array guards, note HTML sanitization, and CSS color validation. | High | Fixed | Added `parseJsonSeguro` (50 MB cap + recursive stripping of `__proto__`/`constructor`/`prototype`), record validation, `sanitizarHtmlSeguro` on notes, and `validarCorCssSegura` on highlight colors. |
| File Upload Verification & Timeouts | `src/parser/fileProcessor.ts`, `src/workers/parser.worker.ts` | 22 | Uploads only checked file extensions without size bounds, binary magic-byte signatures, filename sanitization, or worker timeouts. | Medium | Fixed | Added 100 MB size cap, `%PDF-` / `PK\x03\x04` / non-binary TXT magic-byte verification in both client and worker, filename traversal sanitization, and a 120s worker timeout. |
| External URL & Avatar Validation | `src/firebase.ts`, `src/App.tsx`, `src/components/SettingsView.tsx`, `src/components/SiteFooter.tsx`, `firestore.rules` | 140 | Profile `photoURL` and external links did not strictly enforce `https://` URLs without embedded credentials. | Medium | Fixed | Enforced `sanitizarUrlSegura` across client components and added `^https://.*` regex + length checks in `firestore.rules` and `firebase-blueprint.json`. |
| CSV Formula & HTML Injection | `src/export/exporters.ts` | 710 | Anki CSV exports prefixed UTF-8 BOM without neutralizing spreadsheet formula prefixes (`=`, `+`, `-`, `@`) or escaping HTML in notes. | Medium | Fixed | Applied `escaparCelulaCsvSegura` and `escaparHtmlAnki` in `exportarFlashcardsCsvAnki` plus `sanitizarNomeArquivo` on downloads. |
| Weak Signup Password Bounds & Error Redaction | `src/components/AuthGateView.tsx`, `src/components/ErrorBoundary.tsx` | 173 | Account creation allowed 6-char numeric passwords and `ErrorBoundary` could display raw JSON Firestore error info containing email/UID metadata. | Medium | Fixed | Enforced 8+ character alphanumeric password policy with input `maxLength` bounds and redacted internal JSON error payloads in `ErrorBoundary` via `sanitizarMensagemErroUi`. |
| Missing HTTP Security Headers | `vercel.json`, `index.html` | 1 | Production deployment config lacked `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, and `Content-Security-Policy`. | Medium | Fixed | Added production HTTP security headers in `vercel.json` (preserving Firebase Auth popup compatibility) and `<meta name="referrer">` in `index.html`. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Firestore Access Control & Schema | `firestore.rules`, `firebase-blueprint.json` | Global default-deny baseline, verified-email requirement (`email_verified == true`), strict per-user document isolation (`list` disabled), immutable provenance fields (`uid`, `email`, `provider`, `createdAt`), server-timestamp validation, and HTTPS `photoURL` pattern enforcement. |
| Authentication & Verification Gate | `src/contexts/AuthContext.tsx`, `src/components/AuthGateView.tsx` | All application views remain gated behind Firebase Auth + verified e-mail checks, with honeypot bot filtering and `select_account` Google OAuth prompt. |
| Browser Client Config & Dependencies | `src/firebase.ts`, `bun.lock` | No private server secrets exist in client code; `bun audit` confirmed zero actionable client-bundle advisories (only transitive Node/build tooling advisories in `@grpc/grpc-js`, `glob`, and `minimatch`). |

## PoC Verification

### 1. Stored XSS via Imported Note HTML & Rich Editor Paste
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsanitized HTML Rendering / ContentEditable Ingestion |
| Impact | High |
| Affected File | `src/components/NotesDirectoryView.tsx:191`, `src/components/RichNoteEditor.tsx:37`, `src/db/database.ts:535` |
| Test Scenario | `<p onclick="alert(1)">Nota <b>segura</b></p><script>alert(1)</script><img src=x onerror=alert(1)><svg onload=alert(1)>` |

#### How It Was Fixed
Added allowlist-based HTML sanitization (`sanitizarHtmlSeguro` and `parsearHtmlSeguroParaNos` in `src/utils/security.ts`), removed `dangerouslySetInnerHTML` in favor of React AST node rendering (`SafeHtmlContent`), sanitized clipboard paste/save in `RichNoteEditor`, and sanitized imported backup notes in `database.ts`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Malicious HTML arrives via note backup JSON or rich clipboard paste | Input enters `importarBackupCompleto` / `handlePasteSeguro` / `SafeHtmlContent` |
| 2 | Reaches `parsearHtmlSeguroParaNos` / `sanitizarHtmlSeguro` (`src/utils/security.ts`) | `<script>`, `<img>`, `<svg>`, and `onclick`/`onerror`/`onload` attributes are stripped; only bare `<b>` and `<p>` tags remain |
| 3 | Rendered via `React.createElement` in `SafeHtmlContent` | **Handled Safely** — zero script execution or raw DOM HTML injection |

#### Conclusion
**Fix Verified** — Executable tags and event handlers are stripped before storage and never injected into raw DOM HTML sinks.

---

### 2. Prototype Pollution & Malformed Backup Deserialization
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe JSON Deserialization |
| Impact | High |
| Affected File | `src/components/ExportView.tsx:129`, `src/db/database.ts:519` |
| Test Scenario | `{"aplicacao":"lei-seca","__proto__":{"isAdmin":true},"constructor":{"prototype":{"polluted":true}},"codigos":[{"id":"c1","nome":"CF"}],"artigos":[]}` |

#### How It Was Fixed
Added a 50 MB size limit, recursive stripping of `__proto__`, `constructor`, and `prototype` keys in `parseJsonSeguro`, structural record filtering (`registroTemIdValido`), and CSS color allowlist checks in `importarBackupCompleto`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Crafted JSON backup file is uploaded in `ExportView.tsx:126` | Size checked (`<= 50 MB`) and parsed via `parseJsonSeguro` |
| 2 | `sanitizarObjetoJson` strips `__proto__`, `constructor`, and `prototype` recursively | Prototype-polluting properties are discarded |
| 3 | `importarBackupCompleto` validates arrays, record IDs, note HTML, and CSS highlight colors | **Handled Safely** — clean normalized records persisted to IndexedDB |

#### Conclusion
**Fix Verified** — Prototype-polluting keys and malformed fields cannot alter object prototypes or inject unsafe styles.

---

### 3. Spoofed File Upload & Path Traversal Filename
#### Summary
| Field | Value |
|---|---|
| Issue Type | Insufficient Upload Validation |
| Impact | Medium |
| Affected File | `src/parser/fileProcessor.ts:22`, `src/workers/parser.worker.ts:201` |
| Test Scenario | File named `../../etc/passwd.pdf` containing `<script>alert(1)</script>` instead of `%PDF-` magic bytes |

#### How It Was Fixed
Added filename sanitization (`sanitizarNomeArquivo`), 100 MB file-size limit, binary signature verification (`%PDF-` for PDF, `PK\x03\x04` for DOCX, non-null TXT) on both main thread and Web Worker, plus a 120s worker timeout.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Upload enters `extrairArquivoEmWorker` (`src/parser/fileProcessor.ts:25`) | `sanitizarNomeArquivo` strips `../../etc/` down to `passwd.pdf` |
| 2 | `validarAssinaturaArquivo` inspects leading header bytes | Rejects missing `%PDF-` signature before spawning worker |
| 3 | Worker independently re-validates magic bytes at `parser.worker.ts:206` | **Handled Safely** — spoofed payload rejected with clear error |

#### Conclusion
**Fix Verified** — Spoofed or oversized files and traversal filenames are blocked at both UI and worker boundaries.

---

### 4. CSV Formula Injection & Anki HTML Injection
#### Summary
| Field | Value |
|---|---|
| Issue Type | Spreadsheet Formula Injection |
| Impact | Medium |
| Affected File | `src/export/exporters.ts:708` |
| Test Scenario | Highlight/note containing `=CMD|'/C calc'!A0` and `<img src=x onerror=alert(1)>` exported via `exportarFlashcardsCsvAnki` |

#### How It Was Fixed
Escaped HTML entities via `escaparHtmlAnki` and neutralized leading formula characters (`=`, `+`, `-`, `@`, `\t`, `\r`) with a leading `'` via `escaparCelulaCsvSegura`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Card text enters `exportarFlashcardsCsvAnki` (`src/export/exporters.ts:708`) | `escaparHtmlAnki` encodes `<` and `>` |
| 2 | `escaparCelulaCsvSegura` detects leading `=` | Prepends `'` (`"'=CMD|..."`) and escapes quotes |
| 3 | CSV written with UTF-8 BOM | **Handled Safely** — treated strictly as literal text in spreadsheets and Anki |

#### Conclusion
**Fix Verified** — Spreadsheet formula triggers and raw HTML tags in flashcard exports are neutralized.
