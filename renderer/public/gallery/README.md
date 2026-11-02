# ChatUI Offline Final Edition Candidate Gallery

Unzip this whole directory. Open index.html directly (file://), or run:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory .
```

Then open http://127.0.0.1:4173/index.html. No install, model, server API, CDN or network fetch is required. The HTTP server only serves these local files.

Use G01–G10 buttons, theme and reading width. Tab focuses controls; arrows/Home/End adjust native sliders and tabs; Enter/Space operates buttons and disclosures. Escape closes manual copy and returns focus. Copy uses the complete same-input safe fallback including closed sections and inactive tabs, with quiz grading omitted. Clipboard failure provides selected readonly full text. Geometry/motion/form state can be restored within this page; Quiz is reset on reload/scene switch. Theme changes preserve live Quiz selections and scores inside the frame, without persisting them. Local chapter buttons confirm scrolling before focusing the heading; environments without verified scrolling retain a static outline. No chat history is stored.

Chromium is the automated acceptance target. Safari, Firefox, manual VoiceOver and real ChatGPT host support have only the status recorded in the separate review evidence; do not infer a PASS here. G06 is a static native-text reference, G08 displays real compiler/client rejection and a separately valid quiz.

index.html embeds validated fixtures and the existing trusted Renderer in a scripts-only opaque-origin sandbox. fixtures.json and renderer.html are auditable byte copies, not runtime network dependencies. Quiz grading is separated into component-only _meta; public fixture views, readable fallback and complete copy omit the grading keys and explanations. Fixed grading still ships in the downloaded fixtures and can be inspected in browser DevTools or source. The hidden bootstrap DOM is removed after initialization; this does not make downloaded grading confidential. This local simulated host has no model connection and cannot prove real ChatGPT model visibility.

Verify listed files with SHA256SUMS. Review ZIP contains evidence and is not this runnable Gallery.
