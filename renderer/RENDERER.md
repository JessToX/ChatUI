# ChatUI unified inline renderer 1.6.1-iteration.1

This site serves a stateless MCP Apps renderer at `POST /mcp`. The home page is independent of the inline app. The renderer does not require a database, session store, chat log, remote JavaScript, external fonts, or outbound HTTP requests.

## Route selection

Default to continuous, self-contained native explanations. Use `render_response` only for necessary local visual or interactive aids; simple answers need no tool. Existing HTML, Document, Component and Explanation inputs remain available for compatible or explicitly requested uses. Interpret why questions from the topic, referent and knowledge point. Only explicit current-condition followups may adopt available, source-matched exploration context; an ACK proves receipt only. Skill and MCP instructions guide but cannot intercept or guarantee host routing.

## HTML authoring and output contract

```json
{"contentId":"details-v1","html":"<details><summary><strong>点我展开</strong></summary><p>如果这句话展开出来了，就成功。</p></details>"}
```

Input is a semantic fragment `{contentId,html,title?,theme?:"native",fallbackText?}`. Unknown fields are rejected. IDs and optional titles are nonempty strings up to 200 Unicode characters. The only theme is `native`; title is metadata, not an automatically repeated heading. UTF-8 request/snapshot limit is 256 KiB; oversize inputs fail rather than truncating HTML.

Success returns `structuredContent:{schemaVersion:1,mode:"html",contentId,html,theme:"native",title?}` plus `content:[{type:"text",text:completeFallback}]`. HTML has already been server-sanitized. `lib/html-validation.mjs` supplies strict input/output schemas. Errors return the existing `isError` text result, never fake successful view data.

`lib/html-policy.mjs` is the shared allowlist. It includes semantic containers, headings, emphasis, lists, quotes, code, tables, links, sub/sup and details/summary. Necessary semantic/ARIA/table/link attributes and `details.open` are allowed. Only these class tokens survive: `concept-card`, `derivation`, `key-point`, `note`, `warning`, `success`, `comparison-grid`, `muted`, `compact`, `vector`. No IDs, data attributes, events, inline styles, editable content, scripts, images, forms, SVG, MathML or iframes in HTML mode. Absolute http/https/mailto links are parsed with URL, dangerous protocols removed and safe rel added; clicks reuse the host open-link flow.

The server uses `sanitize-html`; the client independently uses locally bundled DOMPurify. Both parse HTML, not regular-expression sanitization. `HtmlSurface` appends the returned DOM fragment with trusted DOM-only scrolling wrappers, not a second string reparse. It lives in the existing App iframe and does not inject into the host page or introduce nested frames. CSP remains empty for network/resource/frame domains.

Simple vector symbols use `<span class="vector">v</span><sub>LG</sub>`: after sanitation, trusted DOM decoration and empty CSS pseudo-elements draw a font-independent arrow. Existing combining-arrow text in prose/inline code is upgraded without changing copied text; pre/kbd/samp stay literal. Authored vector spans have a readable `vec(v)` fallback and accessible names. Complex TeX/MathML remains on the structured route; no HTML math tags or remote fonts are enabled.

The HTML fallback uses `htmlparser2` on sanitized HTML and preserves Chinese, entities, paragraphs, nested lists, code whitespace, table separators and closed disclosure content. Explicit fallback is literal text. Client validation/sanitation/mount failures show the supplied full text safely. Correct argument errors at most once; unavailable or persistent failure falls back to complete native Markdown.

Trusted styles are scoped and transparent, with native/system themes, 16px/1.75 body text, restrained colors and 18px semantic cards. Derivations use a lightweight left rule with 10px vertical padding rather than card styling; open disclosures have an 18px summary/body gap. Tables/code scroll locally; keyboard focus and selection remain available. Repeated results and theme changes preserve DOM and open disclosures. Toggle uses the existing size notification; mode changes destroy old mounts and callbacks. HTML adds no cross-session persistent state.

## Preserved structured response contract

```json
{
  "schemaVersion": 1,
  "contentId": "progress-6-of-10-v1",
  "facts": {"done": {"value": 6, "unit": "项"}, "total": {"value": 10, "unit": "项"}},
  "blocks": [
    {"id": "intro", "kind": "prose", "text": "已完成 **{{done}}**，总计 {{total}}。"},
    {"id": "progress", "kind": "component", "type": "progress", "data": {"value": {"fact": "done"}, "total": {"fact": "total"}, "unit": "项"}},
    {"id": "next", "kind": "prose", "text": "剩余条目的身份和时间尚未提供。"}
  ]
}
```

Ordered blocks: `prose`, `heading`, `list`, `quote`, `code`, `math`, `component`, `diagram`, `scene`, `group`, `collapse`, `tabs`. See `lib/response-validation.mjs` for the published input schema and runtime output validator; scene is additive to the previous contract. `lib/response-output-schema.mjs` declares the normalized output schema, including rich prose nodes and compiled MathML. `lib/response-normalization.mjs` expands shared facts once and generates both the view (`viewVersion:1`) and full readable text from the same content. Public Quiz views and readable fallbacks omit grading keys and explanations. Component-only `_meta.chatui.quizGrading` supplies local grading after identity validation, without a server grading call.

Both tools reference `ui://chatui/response-v7.html` (with readable `response-v6.html`, `response-v5.html`, `response-v4.html`, `response-v3.html`, `response-v2.html` and `response-v1.html` aliases) through `_meta.ui.resourceUri`. The standard MCP Apps bridge receives complete tool results; partial/input notifications are currently timing diagnostics only, not executable render inputs. No extra model call, fake streaming or runtime CDN is used.

Markdown is rendered as a restricted AST, never HTML. Only credential-free HTTPS links are accepted; image Markdown becomes a labeled source link, not a remote fetch. TeX is compiled server-side with KaTeX `trust:false`, `strict:error`, `maxExpand:128`, `maxSize:4`, then parsed into allowlisted MathML. Macro definitions, HTML, CSS and URL commands are prohibited. Compact `tex` is accepted by math blocks, answer data, and the formula fields of comparison/timeline/steps/reveal-steps items. Legacy structured MathML remains supported. Graphs use real, bounded SVG primitives; no model-supplied JavaScript, CSS, raw SVG or arbitrary expressions execute.

Limits: 256 KiB input, 512 KiB normalized view; 96 total blocks, 64 per group, nesting depth four; 12,000 characters per prose/code block, 2,400 per TeX formula, at most 64 TeX formulas. Unsupported/oversized inputs fail explicitly rather than silently dropping the end of an answer.

One compositor serves the unified and legacy views. Stable block IDs preserve unchanged mounted controls; changed blocks lose stale state. A new `contentId` or changed facts isolate the entire snapshot. Only user operations produce model-visible state. Long responses mount in batches; first-screen content is not deliberately animated or delayed. Malformed results preserve same-source readable text without executing it. Unsupported or rejected continuation sends provide a copyable question containing the actual submitted result.

`window.__chatuiMetrics` records bounded, content-free local timing: input/result receipt, view readiness, first double-animation-frame paint opportunity, mount completion and interaction opportunities. Double-rAF is a browser-paint opportunity proxy, not proof of a ChatGPT-visible paint. Model, real host and network timing are separate and cannot be inferred from the development preview.

## Legacy component contract

`render_component` receives a component object directly, not a nested `config`:

```json
{
  "schemaVersion": 1,
  "contentId": "block-g10",
  "type": "force-diagram",
  "title": "物块受力",
  "data": {
    "body": "2 kg 物块，g = 10 m/s²",
    "unit": "N",
    "forces": [{"id": "weight", "label": "重力", "fx": 0, "fy": -20}]
  }
}
```

The result preserves validated data in `structuredContent`. Tool metadata and `resources/list` reference `ui://chatui/renderer-v5.html`; `resources/read` returns bundled HTML with MIME `text/html;profile=mcp-app`. Component v1–v4 remain readable aliases returning the requested URI and the current component HTML, which supports legacy single-progress configurations. Unknown resource URIs are rejected. MCP initialization reports the package version `1.6.1-iteration.1`; the iframe's independent bridge appInfo version remains `1.5.0`. Its JSON-RPC bridge initializes with the parent host, waits for an actual tool result, mounts the corresponding template, and sends measured size changes. Theme updates preserve active controls. Changed tool data remounts the component and cancels pending old state updates. Duplicate results preserve the current interaction.

The 16 types are listed in `lib/component-validation.mjs`; source examples are in `lib/vendor/component-examples.json`. Real inputs drive force components/resultants, motion sliders, quiz scoring, reveal controls, tab switching, and table sorting/filtering. Host messages and model-context updates are sent only after actual user actions; rejected messages show an error. Quiz continuation uses standard `ui/message` when advertised by the host, with an optional existing `window.openai` compatibility fallback.

Each rendered result is a snapshot of the supplied data. If a follow-up changes values, labels or meaning, submit a new render call with a new `contentId` and the complete current data. Writing updated numbers in prose does not refresh an earlier card. This stateless endpoint does not patch or retrieve a prior conversation result.

Supply explicit `fx`/`fy` or unknown-magnitude direction mode. Only real forces enter sums. There is no default gravitational acceleration. Motion requires explicit initial velocity and acceleration. Invalid or out-of-range physical inputs are rejected instead of silently substituted. Optional geometric height ratio, when supplied, must lie within the supported 0.05–1.95 range.

This private deployment deliberately rejects `media-panel.imageUrl`, avoiding automatic third-party image requests. Source cards retain explanatory text and explicit HTTPS source links. Their links request `ui/open-link` only after a user clicks. The canonical example file may contain image URLs; omit those fields when using this private renderer.

## Composed explanations

`render_explanation` receives an ordered explanation directly, not a nested `config`:

```json
{
  "schemaVersion": 1,
  "contentId": "distinction-v1",
  "facts": {
    "speed": {"value": 0, "unit": "m/s"},
    "acceleration": {"value": -10, "unit": "m/s²"}
  },
  "blocks": [
    {"id": "intro", "kind": "prose", "text": "在最高点，v = {{speed}}，但 a = {{acceleration}}。"},
    {"id": "formula", "kind": "math", "label": "速度为零不表示加速度为零", "math": {"tag": "mrow", "children": [{"tag": "mi", "text": "a"}, {"tag": "mo", "text": "="}, {"tag": "mn", "text": {"fact": "acceleration", "format": "text"}}]}, "detail": "公式数值以 m/s² 为单位。"},
    {"id": "close", "kind": "prose", "text": "观察瞬时速度和速度的变化，是两个不同的问题。"}
  ]
}
```

Optional `title` and ordered `blocks` define the reading flow. `prose` shows short paragraphs in a transparent region; `math` shows safe MathML with optional `label/detail/tone`; `component` reuses an existing `type/data`; `diagram` describes arbitrary labeled relationships using structured primitives; `group` arranges `blocks` with `layout:"stack"` or `"parallel"`. Parallel groups become vertical on narrow screens. There is no `columns` field, arbitrary HTML, SVG source string or generic expression executor.

`facts` is a dictionary of known or explicitly adopted values `{value,unit?,label?,precision?}`. `precision` is an optional integer from 0 through 6 for numeric facts; text facts must omit it. Numeric data uses `{fact:"id"}`; strings use `{{id}}` with units or `{{id|text}}` without units. MathML `text` uses `{fact:"id",format:"text"}`. The other supported formats are `value`, `quantity`, `unit` and `label`. Resolve references before checking child component data. `structuredContent` preserves the validated original snapshot and the client resolves it again before mounting. Shared values prevent inconsistent copies, but validation does not prove source accuracy or derived calculations; those must be checked before calling.

Diagrams require a readable `description` and a numeric `viewBox:{width,height}` object, not an SVG viewBox string. Both dimensions must be 120–1280, and `height/width` must be 0.25–3; the public schema description states this cross-field rule and the server checks it after fact resolution. Static diagrams supply `elements`; stateful diagrams supply 2–6 predefined `states:[{id,label,description?,elements}]`, with unique state IDs, optional common `elements` and `initialState` naming an existing state. Primitives are `point`, `line`, `arrow`, `circle`, `rect`, `path` and `text`, each with a stable `id`, relevant finite coordinates, optional label and semantic color `blue/green/orange/neutral`. Primitive IDs must be unique within each layer; state elements cannot reuse a common element ID, but different states may reuse their own element IDs. Optional `labelX` and `labelY` independently override that label axis within the viewBox; the omitted axis uses the renderer's default position. Paths use `commands:[{op,values}]`, begin with `M`, and accept only `M/L/Q/C/Z`. These are static or predefined observation states, not continuous simulations. Coordinates used for illustration and unverified causal relationships must be identified as such in the supplied description.

Snapshots support up to 80 facts and 48 globally unique blocks, 1–24 blocks in each group and four group levels. Block/fact/primitive identifiers start with a letter and contain at most 80 letters, digits, underscores or hyphens. A diagram layer supports at most 100 primitives, a viewBox dimension of 120–1280 and labels inside the viewBox. Both the original and reference-expanded snapshot must fit the 256 KiB budget. Unknown fields, unsupported primitives, references, path operations or oversized expansions are rejected.

The explanation tool points to `ui://chatui/explanation-v4.html`; explanation v3, v2 and v1 remain readable aliases returning the requested URI with the current explanation HTML. The new default resource URIs separate this release's templates and validation from previously cached resources. It bundles the same component runtime with a compositor. Each nested component has a separate root, instance prefix and state adapter; diagram switches expose real tab and keyboard behavior. Restoration is scoped to the complete snapshot identity and block, including a serialized-data fingerprint. New conditions replace the complete mounted snapshot and discard old pending state updates. Duplicate results and theme changes preserve current valid controls.

`facts` and rendered explanatory text remain fixed for a snapshot. A nested experiment can change its own parameters and readings; that action does not recompute unrelated prose, diagrams or other blocks. Explain this separation where an experiment follows fixed givens, and submit a new full snapshot after a user changes the problem conditions. Host state and model-context updates describe actual received actions, not inferred learning or selections.

Composition controls the sequence **inside** the transparent renderer. The host determines the resource's placement relative to native model prose. Use native prose for necessary transitions and additions; do not promise arbitrary insertion between native paragraphs or repeat the full explanation there. Explicit ordered prose/formula/visual requests and template-free relationships prefer `render_explanation` even with one visual block. Use `render_component` when a standalone mature view is sufficient and no ordered composition is requested; a known applicable smooth-incline problem still prioritizes the analytic entry rather than duplicating its calculation in a composed default experiment.

Three full teaching/comparison/progress snapshots plus a template-free causal loop are in `examples/explanations.mjs`. The plugin also ships directly callable JSON examples under its skill references. These are illustrative inputs, not user records or live-host acceptance results.

## Progress snapshots

For stages sharing a known total and unit, send all known stages in one `progress` result:

```json
{"schemaVersion":1,"contentId":"project-prepared6-reviewed3-v1","type":"progress","data":{"total":10,"unit":"items","stages":[{"id":"prepared","label":"Prepared","value":6},{"id":"reviewed","label":"Reviewed","value":3,"subsetOf":"prepared"}]}}
```

Each stage has its own bar. `subsetOf` records a known containment relationship; the stages are not added into an overall completion rate. A later update to prepared=7, reviewed=3 needs another call with both stages and the total. Counts do not identify the individual items: do not invent chapter numbers or an item-specific step plan from aggregate progress.

`total` must be finite and positive, with finite stage values from 0 through total. There are 1–12 stages with unique nonempty `id` strings up to 80 characters and nonempty `label` strings up to 160 characters. The only stage fields are `id`, `label`, `value` and optional `subsetOf`; a parent must be a different listed stage, containment must be acyclic and a child value cannot exceed its parent. All stages share the outer `total` and optional `unit`. Legacy single progress data `{value,total,label?,unit?}` remains supported, but `value` and `stages` are mutually exclusive. Optional `note` and text-array `details` add context without replacing known stage values. Unknown or zero totals do not produce a fabricated progress bar.

Validation checks the supplied structure and quantities. It cannot establish that the model included every fact from the conversation or that arbitrary labels are grounded in source material. Verify completeness and subsequent automatic calls in live Chat separately.

## Analytic incline entry

For a particle on a fixed smooth plane with only gravity and a normal reaction, use `render_incline_forces` with explicit `contentId`, `massKg`, `gravityMps2` and `inclineDeg`; `title` and `body` are optional. It accepts the problem parameters rather than model-computed force components:

```json
{"contentId":"incline-m2-g10-a30","massKg":2,"gravityMps2":10,"inclineDeg":30}
```

Positive angles rise to the right; negative angles descend to the right. The local +x axis follows that signed tangent. The tool calculates gravity `(0,-mg)` and normal `mg cos(theta) (-sin(theta),cos(theta))`, then returns the existing `force-diagram` structure plus text with the same parameters, net force and acceleration. It does not assume a value of g. The supported angle interval is [-90,90] degrees; the endpoints represent a vertical limiting case with zero normal force and only gravity displayed. Zero angle produces exactly zero net force.

Do not apply this model to friction, additional applied forces, an accelerating plane or initial normal motion. Unknown parameters must remain unknown; use an appropriate direction-only diagram rather than inventing values. The component and incline tools share the current widget resource and standard UI protocol; the explanation tool has a separate composition resource. Local analytic and interaction tests are separate from automatic tool discovery and live Chat acceptance.

## Hosting and authentication

Run this endpoint behind the Sites platform. `tools/call` requires both platform-injected `oai-authenticated-user-id` and `oai-authenticated-user-email`; a service bypass is not a visitor identity. Discovery and generic, data-free UI resources remain accessible without these headers. These checks rely on the Sites dispatch boundary: do not expose this source as a standalone public server that trusts arbitrary client-supplied identity headers.

An HTTP `Origin`, when present, must exactly match the request URL's origin. Server-to-server MCP requests may omit `Origin`. The endpoint does not reflect arbitrary origins. Requests are limited to 256 KiB and bounded JSON nesting. Structured text is inserted as text and formulas use limited MathML. The new HTML path independently sanitizes on server and client; executable model HTML, scripts and styles are never accepted.

Private publishing, actual App IDs, account connection, and plugin binding are deployment tasks. Tool availability and successful local tests do not guarantee that every ordinary Chat turn selects the renderer. Verify actual tool calls and inline host rendering separately.

## Regeneration and checks

From this directory, refresh the source kit and examples, then generate the static bundle:

```sh
node scripts/generate-widget.mjs ../plugins/chatui/skills/chatui/assets/component-kit.html
npm run generate:preview
npm test
```

Without an argument, the generation script uses the vendored kit. It fails if its checked source transforms no longer match. DOM tests use locked development-only `jsdom`; JSON Schema fixtures use locked Ajv. The trusted browser sanitizer is bundled by esbuild. Run `npm ci --ignore-scripts` in this directory first; no parent-repository installation is needed.

Tests additionally cover HTML schemas, server/client attacks and encoded URLs, malformed HTML, real semantic DOM, native disclosures, exact velocity material, complete text fallbacks, mode switching and stale callbacks. Existing tests cover the real JSON-RPC handler, identity and origin checks, all 16 templates, composed blocks and fact expansion, structured diagram states and paths, multi-instance isolation and restoration, malformed/oversized/prototype/MathML payloads, parent-message filtering, supplied `g=10` force data, non-double-counted components, quiz submissions, motion calculations, actual host rejection, and component lifecycle races. They simulate the standard host bridge; they do not establish ChatGPT routing or production host acceptance.

## Protocol references

- [OpenAI ChatGPT UI guide](https://developers.openai.com/plugins/build/chatgpt-ui)
- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [MCP Apps current bridge types](https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts)

Use standard MCP Apps resource metadata and bridge messages, not Work-only Extensions, for ordinary Chat inline rendering.

## Generated scene prototype

`render_response` additionally accepts a `scene` block: `{kind,id,description,givens,state,derived,root}`. Its authoring schema is published in tool discovery. Compose browser flex/grid layouts, literal/bound text, plain mathematical notation, SVG marks and native controls for the content. Givens are immutable; typed local state and acyclic bounded expression trees drive every bound representation together. No domain-specific shape or task templates are required. Runtime checks precede atomic projection; invalid updates keep the last valid view with an explicit error. Optional circle `drag:{state,axis,origin,scale,label}` maps one bounded numeric state to a linear drawing coordinate, with keyboard, tap-button and number alternatives. Preview is local; release commits, Escape/cancel restores. Literal scene strings are not processed as legacy fact placeholders.

Valid exploration changes replace this View's public model context through negotiated `ui/update-model-context` structured or text capabilities. Context is bounded, sourced by content/snapshot/block identity, revisioned, coalesced and serialized. Stale ACKs cannot confirm newer edits. `role:"presentation"`, invalid drafts and private Quiz grading are excluded. Missing capability, denial or timeout keeps local interaction and offers copyable conditions with an explicit unsynced status. No automatic messages, answers, model requests or tool calls occur. State is ephemeral and remount resets it; first-load/refresh context lifecycle and actual model adoption require separate host testing. No storage, arbitrary source execution or nested iframe is added.

The trusted adapter uses DOM/SVG/MathML APIs. Formula parts use MathML mtext, not a new TeX engine. The SVG label adapter retains at least 14 CSS px under responsive scaling. New subjects are view data, not new runtime code. The local tool description also includes a compact authoring grammar and a validated generic binding example, so basic authoring does not depend on a client expanding recursive JSON Schema references. This metadata candidate is not deployed. [Prototype evidence](../docs/native-ui-iteration-1/SCENE-CONTRACT.md) separates synthetic preview acceptance from the failed natural-language unified-view test and pending retest.
