# ChatUI Renderer 1.6.1-iteration.1 · Local Release Candidate

Current scope, versions and remaining gates: [release notes draft](../docs/release-preparation/RELEASE-NOTES.md). Public installation steps: [installation](../docs/installation.md). No release archive has been published. Older dated reports linked below are historical evidence, not current installation or licensing instructions.

2026-10-19 local vertical candidate: continuous native explanations with optional `render_response` aids, generic typed drag controls and a bounded public model-context relay. The standalone preview labels its native/why text as prewritten fixtures and its ACKs as simulated. No model backend or real-host acceptance is supplied by the preview. See [source scope and host gates](../docs/native-ui-iteration-1/SCENE-CONTRACT.md).

Portable Plugin / Codex overlay **1.0.0**, Renderer package / lockfile / MCP serverInfo **1.6.1-iteration.1** are local candidate metadata, **not published versions**. **Local RC ≠ Published Release ≠ Host Validated ≠ GitHub Archived.** This candidate does not update a real ChatGPT connection or deployment. Current candidate scope and security limitations belong to [Offline Final](../docs/final-edition/security-and-limitations.md); current package identity and checks belong to [distribution instructions](../docs/release-preparation/DISTRIBUTION.md).

Rich Document v1 is implemented additively on this branch. `render_document` accepts compact Markdown/math/directives and reuses the safe response compositor. `documentVersion: 1` remains unchanged. The current UI cache URI is `ui://chatui/document-v4.html`; `document-v3.html`, `document-v2.html` and `document-v1.html` remains a readable compatibility alias. Current authoring guidance keeps continuous native explanation primary and uses `render_response` for necessary local aids; the six existing tools remain compatible. Historical deployed routing is not changed by this source candidate. The historical isolated staging worker's opt-in routing is separate from this offline candidate. See [language contract](../docs/rich-document-v1-spec.md), [historical acceptance report](../docs/rich-document-v1-acceptance.md) and [review-only production migration](../docs/rich-document-v1-production-migration/README.md).

Stateless MCP Apps service at `POST /mcp`, upgraded in place with two routes:

- `render_html`: ordinary explanations, writing, translation, summaries, code explanations, static tables and native disclosures. Semantic HTML is sanitized by `sanitize-html` on the server and DOMPurify in the existing App iframe.
- `render_response`: additive generated `scene` views (browser flex/grid, SVG marks, shared typed values and bounded pure calculations), plus existing structured quizzes, charts, progress, diagrams, experiments, stateful interfaces and complex TeX/MathML. Its input contract and component/state behavior are retained. An output schema describes the normalized view, not the authoring input.

Mixed complex interaction uses `render_response` for the entire turn. Simple confirmations and explicit plain-text/Markdown requests stay native. No additional model calls, database, chat storage, runtime CDN, remote scripts/images or nested iframes are introduced.

**Local checks do not establish the deployed version.** Historical [B1 engineering evidence](../docs/final-edition/b1.md), [acceptance](../docs/acceptance-v0.9.0.md) and [source release](../docs/release-v0.9.0.md) record earlier checks and outstanding account operations; they are not current Offline Final PASS evidence. The standalone source ZIP preserves sibling `renderer/` and `docs/` directories; run the commands below from `renderer/`.

## Build and checks

Use Node.js 24.20.0 and npm 12.0.2 for candidate verification. The declared Node range is 24.20 or newer within 24.x; other major versions are not covered by this candidate. Install locked dependencies without global lifecycle-script changes:

```sh
npm ci --ignore-scripts
# Fresh LOCAL checks only; preserves any existing binding or symlink:
node scripts/prepare-local-config.mjs
npm test
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint
npm run build
```

The helper creates `.openai/hosting.json` from the public example only when absent, using exclusive creation. It preserves existing files and file/directory symlinks without reading their contents. A symlink is left for its owner to manage; the helper does not replace or repair it. The example has null D1/R2 bindings and is not deployable. Preserve the original Sites-managed binding and audience when updating the existing Site; never replace them with a placeholder. Data-bearing calls require the authenticated Sites visitor identity. Do not expose an arbitrary public service that trusts user-supplied identity headers.

`generate:widget` prebuilds the unified, component and explanation resources using native JavaScript. It bundles DOMPurify and trusted scoped HTML styles at build time. The parent canonical component kit is used when present, otherwise the included vendor copy. Never hand-edit generated resources. Markdown, HTML fallback parsing and KaTeX stay on the server.

`generate:preview` generates the existing HTML, structured and Rich Document references, matched comparisons, plus the Phase 2A G01/G04/G05 Document prototypes and G06 native text control. In the monorepo it also updates existing Skill input examples from the same factories. Source bundles remain standalone-buildable with the vendor kit.

`generate:gallery` compiles fixed Phase 2B G01–G08 fixtures into validated Views and complete safe fallback text, then embeds the existing trusted Renderer in `public/gallery/index.html`. `build` runs all three generators. `node scripts/check-generation.mjs` writes outputs in two passes, including an additional RC-fixture generator under `output/playwright/rich-document/rc/`, and checks byte equality between the passes. It does not compare the starting files or measure timing. Review the resulting Git diff against your pre-existing changes; never discard changes just to make this check appear clean. The source/output map and targeted maintenance checks are in [ENGINEERING](../docs/ENGINEERING.md).

Quiz tool results carry a non-secret UUIDv4 `structuredContent.deliveryId` matched to `_meta.chatui.quizGrading.deliveryId`. Each real MCP Quiz call uses fresh secure randomness. Offline generators supply an explicit trusted fixture instance label for deterministic build bytes; real MCP requests cannot supply that label or ID. `contentId`, public `sourceHash`/`viewHash`, and per-mount state nonce retain their separate roles. Delivery identity binds metadata before the existing configuration and block reconciliation; unchanged controls retain their interaction, while changed Quiz data or grading remounts that Quiz. Missing, malformed or mismatched IDs safely disable grading.

This binding rejects older metadata paired with the current public output. It cannot identify a complete old public-output-plus-metadata pair replayed by the host as current: both IDs still match. Real-host authoritative ordering/call identity remains **UNKNOWN / NO-GO** until verified. The ID is not a signature, authentication or secret; grading remains inspectable by the browser user in component-only metadata.

## Development preview

```sh
npm run dev
# /preview.html?example=html-details&theme=light&width=320
# /preview.html?example=html-velocity&theme=dark&width=375
# /preview.html?example=html-reading&theme=light&width=768
```

Or serve `public/` with a local static server. Width controls: 320, 375, 390, 768 and 1024px. The preview exercises the exact MCP resource bytes and standard postMessage bridge; it does not send messages to ChatGPT. `?legacy=1` keeps old examples, `?followup=off` checks the copyable continuation path, and `?bare=1` hides developer chrome.

Phase 2A's three working prototypes use the same Rich Document compiler, validated View, compositor and component runtime. Start a local preview from this directory:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory public
# http://127.0.0.1:4173/preview.html?phase=2a&example=document-g01
# Change example to document-g04, document-g05, or native-g06.
```

The long-document outline is static because this preview's iframe expands to its content. Full copy includes closed disclosures and every tab; denied clipboard access exposes selectable complete text. G06 never mounts a Renderer. This HTTP development preview is separate from the offline Gallery. See the [Intellectual UI specification](../docs/final-edition/intellectual-ui-ux-spec.md) and [Phase 2A evidence](../docs/final-edition/phase2a.md).

## Offline Gallery

After the first build and checks above, open `public/gallery/index.html` directly with a local `file://` URL, or serve the same directory:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory public/gallery
# http://127.0.0.1:4173/index.html
```

The Gallery makes no runtime fetch, model, MCP or CDN calls. Its scripts-only sandbox reuses the trusted Renderer and a limited local host adapter. G06 is a static native text reference; G08 labels compiler rejection, client rejection, tool failure fallback and a separate valid quiz. Theme, width, sliders, disclosures, tabs, quiz and full copy are local demonstrations. Clipboard failure exposes readonly complete fallback text; Quiz answers are omitted before submission. Scene changes destroy the old frame and reset Quiz state.

This source ZIP includes Gallery sources, generated bytes and notices. The separate Gallery RC ZIP needs no npm install. Current browser, accessibility and host scope follows [STATUS](../docs/release-preparation/VALIDATION.md); the [Phase 3 report](../docs/final-edition/phase3.md) is historical evidence. Basic display of six exact public synthetic inputs has been covered, while untested layouts, recovery, protocol paths, browsers and accessibility remain unverified. Local Gallery checks do not establish real ChatGPT host acceptance. Third-party notices preserve dependency licenses. The current clean source tree has a root [MIT LICENSE](../LICENSE), Copyright (c) 2026 Jess(T o X), covering original contributions only. Third-party licenses remain unchanged. This statement does not relicense excluded old history. See [current scope](../README.md).

Discovery lists only `ui://chatui/document-v4.html`, `ui://chatui/response-v7.html`, `ui://chatui/renderer-v5.html` and `ui://chatui/explanation-v4.html`. Sixteen historical aliases remain explicit read keys (twenty reads total). Alias reads preserve the requested URI and return corresponding current compatible bytes; they do not promise historical byte identity or upgrade an already cached iframe. UI cache revisions do not change data schema versions. Both tool metadata keys reference the new primary URIs. MIME stays `text/html;profile=mcp-app`, with no expanded CSP permissions. Iteration 1 adds the input-form type and its authoring description to the existing component routes; all prior authoring vocabulary remains compatible. The four Quiz-capable output schemas allow the result delivery identity. Old Quiz outputs without it safely disable grading. See `RENDERER.md` for precise contracts, limits, authentication, lifecycle and timing boundaries.


The resource-URI revision is a local candidate, not a deployed host acceptance claim. Existing histories using previous URIs can still request compatible current bytes; cached old components may remain old. A direct rollback to the saved private v4/v3 server restores its old primary URIs but that server does not know the newly introduced URIs: newly created histories may need their complete native fallback. Full history-preserving rollback needs a separately reviewed compatibility build retaining the new URI reads; do not silently claim that an old saved-version redeploy preserves them. Keep prior saved versions and hashes, and verify the actual iframe script hash before attributing host results to a new bridge.


Temporary startup diagnostics are disabled by default. Only the explicitly authorized private diagnostic build sets `CHATUI_STARTUP_DIAGNOSTICS=1` during generation/build, adding an own-document opt-in marker. It emits at most32 `[ChatUI startup v1]` console records per iframe and mirrors the same records on the own root: enum stage, sequence, local elapsed milliseconds and boolean readiness/result/content-presence flags. No text, values, IDs, payloads, metadata, error details, credentials, cookies, external telemetry, storage service or network/CSP change. Console failure cannot block rendering. These stages are not host traces or browser paint proof.

Generated scene prototype: see [scope, checks and remaining host blocker](../docs/native-ui-iteration-1/SCENE-CONTRACT.md). No new dependency, tool, network permission or persistence is introduced. The six existing tools remain; the response UI cache URI is v7. Local source integration does not establish real-host first-load, refresh or native-message acceptance.
