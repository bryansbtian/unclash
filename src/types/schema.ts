// ── Node Types ──────────────────────────────────────────────
export const NODE_TYPES = [
  "container",
  "sidebar",
  "navbar",
  "card",
  "table",
  "chart",
  "button",
  "input",
  "text",
  "image-placeholder",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

// ── Core Interfaces ─────────────────────────────────────────

export interface WireframeNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  children: WireframeNode[];
  styles?: Record<string, string>;
  metadata?: Record<string, unknown>;
  confidence?: number;
}

// Tree of elements parsed from the generated React code (data-unclash-id elements)
export interface CodeNode {
  id: string;
  tagName: string;
  children: CodeNode[];
}

export interface ElementOverride {
  backgroundColor?: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
  borderRadius?: string;
  width?: string;
  height?: string;
  padding?: string;
  textContent?: string;
}

export interface SelectedElementInfo {
  tagName: string;
  className: string;
  styles: {
    backgroundColor: string;
    color: string;
    fontSize: string;
    fontWeight: string;
    borderRadius: string;
    width: number;
    height: number;
  };
  textContent: string;
}

export interface Page {
  id: string;
  name?: string;
  width: number;
  height: number;
  children: WireframeNode[];
  canvasX?: number;
  canvasY?: number;
  // Code mode: AI-generated React component (function App() {...})
  code?: string;
  elementOverrides?: Record<string, ElementOverride>;
}

export interface Project {
  id: string;
  name: string;
  originalScreenshot?: string;
  pages: Page[];
}
