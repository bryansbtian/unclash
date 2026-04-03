# Unclash — Screenshot to Editable React Components

Upload a screenshot of any UI, and Unclash's AI pipeline generates a faithful React + Tailwind component rendered live in the editor. Every structural element becomes a selectable, editable component. Export clean React code when you're done.

---

## Quick Start

```bash
cp .env.example .env.local   # add your Anthropic API key
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_SECRET_KEY` | Yes | — | Anthropic API key |
| `ANTHROPIC_MODEL` | No | `claude-opus-4-6` | Primary model |
| `ANTHROPIC_FAST_MODEL` | No | `claude-haiku-4-5-20251001` | Fast model for title generation |

---

## How It Works

1. **Upload** a screenshot (or paste from clipboard)
2. **AI generates** a React component that recreates the UI with Tailwind CSS and Lucide React icons
3. **Canvas renders** the component live in an iframe — no build step needed
4. **Click any element** to select it; edit colors, typography, spacing, and text in the Properties panel
5. **Layers panel** shows the full component tree derived from the rendered DOM
6. **Export** the component as a ready-to-use React + Tailwind file

---

## AI Pipeline

### Screenshot Mode (primary)

When a screenshot is provided, the pipeline runs two stages:

```
Screenshot
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Stage F — React Component Generation               │
│  Model: claude-haiku-4-5 (fast)                     │
│                                                     │
│  Given the screenshot, generates a self-contained   │
│  React functional component (function App() {...})  │
│  using Tailwind CSS and Lucide React icons.         │
│                                                     │
│  Every structural element (div, section, nav,       │
│  header, main, aside, footer) receives a unique     │
│  data-unclash-id attribute — these become the       │
│  editable components in the editor.                 │
│                                                     │
│  Output: JSX string (function App() { ... })        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Parse Stage — Component Tree Extraction            │
│  Deterministic (no LLM)                             │
│                                                     │
│  Two passes:                                        │
│  1. Server-side: regex scans JSX for                │
│     data-unclash-id attributes + uses indentation   │
│     to infer parent-child nesting → CodeNode tree   │
│  2. Client-side: after React renders in the iframe, │
│     the real DOM is traversed to build an accurate  │
│     tree from actual element nesting, sent to the   │
│     parent via postMessage                          │
│                                                     │
│  Output: CodeNode[] tree (id, tagName, children)    │
└─────────────────────────────────────────────────────┘
```

### Prompt-Only Mode (no screenshot)

When only a text prompt is given (no screenshot), an empty page is created and the user can describe what they want built via the chat panel.

---

## Canvas Rendering

The generated `function App()` component is rendered inside a sandboxed `<iframe>` using:

- **React 18** (UMD CDN)
- **Tailwind CSS** (CDN)
- **Lucide** (UMD CDN — available as the global `lucide` object)
- **Babel Standalone** (transpiles JSX at runtime — no build step)

A small runtime script is injected alongside the component to handle:
- **Click → select**: clicking a `[data-unclash-id]` element sends an `element-selected` postMessage to the parent with computed styles and element info
- **Hover outline**: temporary dashed blue border on hover
- **Style updates**: parent sends `update-style` / `update-text` postMessages to apply live edits without re-rendering the component
- **Selection sync**: selected element stays highlighted (solid blue outline) when switching panels
- **DOM tree broadcast**: after React renders, a `dom-tree` postMessage sends the full `CodeNode` tree to the parent, populating the Layers panel

---

## Element Overrides

Edits made in the Properties panel are stored as `ElementOverride` records keyed by `data-unclash-id`. They are:

1. Applied **live** via postMessage to the running iframe (instant, no reload)
2. Persisted in Zustand page state
3. Injected as a `<style>` block when the iframe is rebuilt (e.g. page switch)
4. Baked into the exported code at export time

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| AI | Anthropic Messages API |
| Icons | Lucide React |
| Export | JSZip |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                        # Landing page — upload + prompt input
│   ├── globals.css                     # Global styles and CSS variables
│   ├── editor/
│   │   └── page.tsx                    # Editor — consumes SSE, renders canvas
│   └── api/
│       └── generate/route.ts           # SSE streaming endpoint — runs pipeline
├── components/
│   ├── canvas/
│   │   ├── Canvas.tsx                  # Pan/zoom artboard
│   │   └── CodeFrame.tsx               # iframe renderer + postMessage bridge
│   ├── panels/
│   │   ├── ChatPanel.tsx               # Pipeline progress + chat modifications
│   │   ├── LayerPanel.tsx              # Component tree (CodeNode or WireframeNode)
│   │   ├── PropertiesPanel.tsx         # Element editor — colors, text, spacing
│   │   └── Toolbar.tsx                 # Top bar — undo/redo, export
│   └── export/
│       └── CodePreview.tsx             # Export modal with file tabs
├── services/
│   ├── pipeline/
│   │   ├── prompts.ts                  # System prompts for all AI stages
│   │   └── stageF-codegen.ts           # Stage F — React code generation
│   ├── anthropic.ts                    # Anthropic API client
│   └── codeGenerator.ts               # Export bundler (React + Tailwind files)
├── store/
│   └── editorStore.ts                  # Zustand store — pages, selection, overrides
└── types/
    ├── pipeline.ts                     # Stage result types
    └── schema.ts                       # Page, CodeNode, ElementOverride, etc.
```

---

## API

### `POST /api/generate` (streaming SSE)

Accepts `FormData` with `screenshots` (files) and an optional `prompt` string. Streams real-time stage updates.

**Event types:**

| Event | Payload |
|---|---|
| `title` | `{ title: string }` — AI-generated project name |
| `stage` | `{ id, status, label, description }` — pipeline stage update |
| `complete` | `{ pages: Page[] }` — final result |
| `error` | `{ message: string }` |

**Stage IDs (screenshot mode):** `upload` → `codegen` → `parse`

**Stage statuses:** `pending` → `running` → `complete` / `failed`
