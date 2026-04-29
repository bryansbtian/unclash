# About Unclash

Unclash is an AI-powered design-to-code tool that turns a screenshot of any user interface into a live, editable React + Tailwind component. You drop in an image — a dashboard, a landing page, a mobile app screen — and within seconds the app reproduces it in a canvas where every structural element is clickable, editable, and exportable as clean code.

The goal is to collapse the gap between "I see a design I like" and "I have a working component in my codebase." No hand-transcription, no pixel pushing, no Figma plugins. Upload → edit → export.

---

## The Problem It Solves

Designers produce mockups, engineers rebuild them from scratch. That translation step — reading a design, deciding on a DOM structure, naming divs, picking Tailwind classes, wiring Lucide icons — is slow, repetitive, and error-prone.

Unclash treats the screenshot itself as the source of truth and uses a multimodal LLM to generate the JSX that reproduces it. The output is not a black-box render: every `<div>`, `<section>`, `<nav>`, and `<button>` is tagged with a stable identifier so the editor can select, style, and rewrite it interactively.

---

## The Pipeline

Unclash has two generation modes, depending on what the user provides.

### Screenshot Mode (primary)

This is the core path. It runs three stages end-to-end, streamed to the client over Server-Sent Events so the chat panel can show progress in real time.

```
 ┌────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌──────────┐
 │ Screenshot │ → │ Stage 1: Detect │ → │ Stage 2:     │ → │ Stage 3: │
 │  upload    │   │ screens in img  │   │ Code-gen JSX │   │ Parse    │
 └────────────┘   └─────────────────┘   └──────────────┘   └──────────┘
```

**Stage 1 — Screen Detection**

Before anything else, a fast multimodal call looks at the uploaded image and decides:
- How many distinct screens are visible? A single mockup can contain several phone frames or desktop views side-by-side.
- What viewport are they? (mobile 390×844, tablet 768×1024, or desktop 1440×900)
- Where is each screen located in the image? (top-left, middle-right, etc.)

If multiple screens are detected, the pipeline fans out — each screen becomes its own page in the editor, and Stage 2 is invoked once per screen with a `screenFocus` hint telling the model which region to reproduce. This is what lets users drop in a Figma export of a whole user flow and get one page per frame.

**Stage 2 — Code Generation**

The heavy lift. The screenshot (plus optional `screenFocus` and viewport dimensions) is sent to Claude with a system prompt that asks for:
- A single self-contained `function App() { return (...) }` component.
- Tailwind utility classes only (no CSS-in-JS, no custom stylesheets).
- Lucide React icons, available via the global `lucide` object at runtime.
- A unique `data-unclash-id` attribute on every structural element (`div`, `section`, `nav`, `header`, `main`, `aside`, `footer`, `article`, `button`, `a`, etc.).

That last rule is the one that makes the editor possible. The `data-unclash-id` attributes are the bridge between the generated code, the rendered DOM, and the editor's state — they're how a click on a pixel in the canvas resolves to a specific element in the component tree.

**Stage 3 — Component Tree Extraction**

Deterministic, no LLM. It runs in two passes:

1. *Server-side pre-parse.* The returned JSX string is scanned with a regex for `data-unclash-id` attributes. Indentation is used to infer nesting, producing a preliminary `CodeNode[]` tree. This is what the stage progress reports as "N blocks identified."
2. *Client-side DOM pass.* Once the component renders inside the iframe, the real DOM is walked and a more accurate tree is built from actual element nesting. That tree is sent back to the parent window via `postMessage` and populates the Layers panel. The DOM pass is authoritative because it reflects the post-React structure, including any conditionals or loops the static parser can't see.

### Prompt-Only Mode

If the user describes an idea without uploading anything, the pipeline short-circuits: an empty page is created and the user refines it via the chat panel.

### Title Generation

In parallel with the main pipeline, a small fast-model call (Claude Haiku) summarizes the prompt into a 1–5 word project title. This is what shows up in the browser tab and the editor header. If there's no prompt but there are images, the title defaults to "Design Analysis."

---

## How the Canvas Works

The generated `function App()` doesn't get compiled into the Next.js bundle — that would require a build step per generation. Instead it runs **inside a sandboxed iframe** alongside three CDN-loaded dependencies:

- React 18 (UMD)
- Tailwind CSS (CDN)
- Lucide (UMD, as a global)
- Babel Standalone (transpiles the JSX at runtime)

A small runtime script is injected into the iframe alongside the component. It handles four jobs:

1. **Click-to-select.** A click on any `[data-unclash-id]` element sends an `element-selected` postMessage to the parent with the element's id, tag name, and computed styles. The parent's Properties panel hydrates from that payload.
2. **Hover outlines.** A dashed blue border follows the cursor; the currently-selected element keeps a solid blue outline.
3. **Live style + text edits.** When the user changes a color or font size in the Properties panel, the parent sends `update-style` / `update-text` messages to the iframe. The runtime applies them directly to the DOM — no re-render, no latency.
4. **DOM tree broadcast.** After React mounts, the runtime walks the real DOM and posts a `dom-tree` message back. That's what populates the Layers panel with the authoritative component hierarchy.

The iframe is a clean isolation boundary: the generated component can't touch the host page's state, the host doesn't need to evaluate untrusted code directly, and rebuilding the iframe is a page reload rather than a React reconciliation.

---

## Edits and Overrides

Every edit the user makes — a color change, a new padding value, updated button text — becomes an `ElementOverride` record keyed by `data-unclash-id`. These overrides are:

1. **Applied live** via postMessage to the running iframe. Instant feedback, no rebuild.
2. **Persisted** in the Zustand store, attached to the current page.
3. **Re-injected** as a `<style>` block when the iframe is rebuilt (e.g. switching to another page and back, or reloading).
4. **Baked in** at export time — the exported JSX has the final styles inlined or merged into the Tailwind classes, so the output doesn't carry runtime override machinery.

This separation means edits are cheap (they don't rewrite the component) but durable (they survive page switches and show up in the exported code).

---

## The Editor Shell

Around the canvas, the editor is a fairly conventional three-panel layout:

- **Left — Chat Panel.** Shows streaming pipeline stages during generation, then becomes a chat interface for modifying the page with follow-up instructions.
- **Center — Canvas.** Pan and zoom over the iframe. A floating `ToolsBar` at the bottom exposes selection, drawing, text, comment, and upload tools, plus undo/redo.
- **Right — Properties Panel.** Colors, typography, spacing, and text fields for the currently-selected element.
- **Top — Toolbar.** Page switcher, project name, export button.

Keyboard shortcuts (handled in `useEditorKeyboard.ts`) cover the usual suspects: Ctrl/Cmd+Z/Y for undo/redo, Ctrl/Cmd+C/V for copy/paste, arrow keys for nudging, Delete/Backspace to remove, and single-letter tool shortcuts (V, H, R, L, T, etc.) mirroring Figma conventions.

Undo/redo works against full-page snapshots committed to a history stack. Continuous operations like drag and resize use `updateNodeSilent` during the gesture and only commit once on mouseup — so a drag is one undo step, not hundreds.

---

## Export

When the user clicks Export, the current page's code is combined with all `ElementOverride` edits to produce a final JSX string. That string is written into a minimal project scaffold (package.json, index.html, App.jsx, Tailwind config) and zipped via JSZip for download. The resulting archive builds and runs with `npm install && npm run dev` — no Unclash runtime required.

---

## Stack at a Glance

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | React 19 + Tailwind CSS v4 |
| State | Zustand v5 |
| AI | Anthropic Messages API (Claude Opus + Haiku) |
| Icons | Lucide React |
| Export | JSZip |
| Runtime rendering | iframe + Babel Standalone + UMD React/Lucide |

Models are configurable via env: `ANTHROPIC_MODEL` (primary, defaults to `claude-opus-4-6`) and `ANTHROPIC_FAST_MODEL` (titles and codegen, defaults to `claude-haiku-4-5-20251001`).

---

## Design Tradeoffs

A few decisions worth naming:

- **Iframe + Babel over a build step.** Slower first render than a compiled bundle, but avoids tying generation to Webpack/Next and keeps the generated component fully portable.
- **`data-unclash-id` everywhere.** Bloats the generated markup, but it's the anchor that makes every downstream feature (click-to-select, overrides, tree view, stable edits across regenerations) possible.
- **Overrides instead of rewriting JSX.** Edits don't mutate the source code — they layer on top. Simpler to reason about, but it means the "true" code only comes together at export.
- **Fast model for codegen.** Haiku generates surprisingly good markup from screenshots and is an order of magnitude cheaper and faster than Opus. Opus is held in reserve for harder stages.
- **SSE streaming.** The pipeline reports every stage transition as it happens, so the chat panel can show the user what's going on rather than spinning for 20 seconds on a blank screen.
