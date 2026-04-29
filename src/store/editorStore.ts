import { create } from "zustand";
import { v4 as uuid } from "uuid";
import { Page, WireframeNode, ElementOverride, SelectedElementInfo, CodeNode } from "@/types/schema";
import { AlignmentGuide } from "@/components/canvas/alignmentGuides";
import { extractElementCode, insertElementCode, duplicateElementCode, deleteElementCode } from '@/app/actions/astActions';

const MAX_HISTORY = 50;

interface EditorState {
  // Project state (multi-page)
  pages: Page[];
  currentPageId: string | null;
  projectName: string;
  originalScreenshot: string | null;

  // Editor state
  selectedNodeId: string | null;
  selectedPageId: string | null;
  isExportOpen: boolean;
  activeTool:
    | "move"
    | "hand"
    | "section"
    | "webpage"
    | "frame"
    | "rectangle"
    | "line"
    | "arrow"
    | "ellipse"
    | "text"
    | "comment"
    | "upload";

  // Alignment guides (transient – visible only during drag)
  alignmentGuides: AlignmentGuide[];

  // History (undo/redo) - per current page
  history: Page[];
  historyIndex: number;

  // Clipboard
  clipboard: WireframeNode | null;

  // Code mode: parsed DOM tree from iframe (data-unclash-id elements)
  codeNodes: CodeNode[];
  // Code mode: selected element in iframe
  selectedElementId: string | null;
  selectedElementInfo: SelectedElementInfo | null;

  // Pending generation input (passed from home → generate page)
  pendingPrompt: string;
  pendingScreenshots: File[];
  pendingPreviews: string[];

  // Actions
  setPendingInput: (prompt: string, screenshots: File[], previews: string[]) => void;
  clearPendingInput: () => void;
  setPage: (page: Page) => void;
  setPages: (pages: Page[]) => void;
  replaceCurrentPage: (page: Page) => void;
  setCurrentPage: (pageId: string) => void;
  addPage: (page: Page) => void;
  addBlankPage: () => void;
  addPageAfter: (pageId: string) => void;
  removePage: (pageId: string) => void;
  duplicatePage: (pageId: string) => void;
  updatePage: (pageId: string, updates: Partial<Page>) => void;
  setProjectName: (name: string) => void;
  setOriginalScreenshot: (url: string | null) => void;
  selectNode: (id: string | null, pageId?: string | null) => void;
  setExportOpen: (open: boolean) => void;
  setActiveTool: (tool: EditorState["activeTool"]) => void;
  setAlignmentGuides: (guides: AlignmentGuide[]) => void;

  // Node operations (all push to history for current page)
  updateNode: (id: string, updates: Partial<WireframeNode>) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  moveNode: (id: string, x: number, y: number) => void;
  resizeNode: (id: string, width: number, height: number) => void;

  // Silent updates (no history push — use during continuous drag/resize)
  updateNodeSilent: (id: string, updates: Partial<WireframeNode>) => void;
  commitToHistory: () => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Clipboard
  copyNode: (id: string) => void;
  pasteNode: () => Promise<void>;

  // Code mode actions
  // Code mode actions
  setCodeNodes: (nodes: CodeNode[]) => void;
  setSelectedElement: (id: string | null, info?: SelectedElementInfo) => void;
  updateElementOverride: (pageId: string, elementId: string, override: ElementOverride) => void;
  copyCodeElement: (id: string) => Promise<void>;
  pasteCodeElement: () => Promise<void>;
  duplicateCodeElement: (id: string) => Promise<void>;
  deleteCodeElement: (id: string) => Promise<void>;

  // Helpers
  getSelectedNode: () => WireframeNode | null;
  flatNodes: () => WireframeNode[];
}

// ── Tree utilities ────────────────────────────────────────

function updateNodeInTree(
  nodes: WireframeNode[],
  id: string,
  updater: (node: WireframeNode) => WireframeNode,
): WireframeNode[] {
  return nodes.map((node) => {
    if (node.id === id) return updater(node);
    if (node.children.length > 0) {
      return {
        ...node,
        children: updateNodeInTree(node.children, id, updater),
      };
    }
    return node;
  });
}

function removeNodeFromTree(
  nodes: WireframeNode[],
  id: string,
): WireframeNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: removeNodeFromTree(node.children, id),
    }));
}

function findNodeInTree(
  nodes: WireframeNode[],
  id: string,
): WireframeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeInTree(node.children, id);
    if (found) return found;
  }
  return null;
}

function flattenNodes(nodes: WireframeNode[]): WireframeNode[] {
  const result: WireframeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) {
      result.push(...flattenNodes(node.children));
    }
  }
  return result;
}

function cloneWithNewIds(node: WireframeNode): WireframeNode {
  return {
    ...node,
    id: uuid(),
    x: node.x + 20,
    y: node.y + 20,
    children: node.children.map(cloneWithNewIds),
  };
}

function deepCloneNode(node: WireframeNode): WireframeNode {
  return {
    ...node,
    children: node.children.map(deepCloneNode),
    styles: node.styles ? { ...node.styles } : undefined,
    metadata: node.metadata ? { ...node.metadata } : undefined,
  };
}

// ── Helper: push page state to history, truncating any redo states ──

function pushHistory(state: EditorState, newPage: Page): Partial<EditorState> {
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push(JSON.parse(JSON.stringify(newPage)));
  if (newHistory.length > MAX_HISTORY) newHistory.shift();
  return {
    pages: state.pages.map((p) => (p.id === newPage.id ? newPage : p)),
    history: newHistory,
    historyIndex: newHistory.length - 1,
  };
}

// ── Store ─────────────────────────────────────────────────

export const useEditorStore = create<EditorState>((set, get) => ({
  pages: [],
  currentPageId: null,
  projectName: "Untitled Project",
  originalScreenshot: null,
  selectedNodeId: null,
  selectedPageId: null,
  isExportOpen: false,
  activeTool: "move",
  history: [],
  historyIndex: -1,
  clipboard: null,
  alignmentGuides: [],
  pendingPrompt: "",
  pendingScreenshots: [],
  pendingPreviews: [],
  codeNodes: [],
  selectedElementId: null,
  selectedElementInfo: null,

  setPendingInput: (prompt, screenshots, previews) =>
    set({ pendingPrompt: prompt, pendingScreenshots: screenshots, pendingPreviews: previews }),
  clearPendingInput: () =>
    set({ pendingPrompt: "", pendingScreenshots: [], pendingPreviews: [] }),

  setPage: (page) => {
    const p = { ...page, id: page.id || `page-${uuid()}`, name: page.name || 'Home' };
    const snapshot = JSON.parse(JSON.stringify(p));
    set({
      pages: [p],
      currentPageId: p.id,
      history: [snapshot],
      historyIndex: 0,
    });
  },

  setPages: (pages) => {
    const normalized = pages.map((p) => ({ ...p, id: p.id || `page-${uuid()}` }));
    const firstId = normalized[0]?.id ?? null;
    set({
      pages: normalized,
      currentPageId: firstId,
      history: firstId ? [JSON.parse(JSON.stringify(normalized.find((x) => x.id === firstId)!))] : [],
      historyIndex: firstId ? 0 : -1,
    });
  },

  replaceCurrentPage: (page) => {
    const state = get();
    if (!state.currentPageId) return;
    const p = { ...page, id: state.currentPageId };
    set(pushHistory(state, p));
  },

  setCurrentPage: (pageId) => {
    const state = get();
    const page = state.pages.find((p) => p.id === pageId);
    if (!page) return;
    set({
      currentPageId: pageId,
      selectedNodeId: null,
      selectedPageId: null,
      history: [JSON.parse(JSON.stringify(page))],
      historyIndex: 0,
    });
  },

  addPage: (page) => {
    const state = get();
    const p = { ...page, id: page.id || `page-${uuid()}` };
    const newPages = [...state.pages, p];
    set({
      pages: newPages,
      currentPageId: p.id,
      history: [JSON.parse(JSON.stringify(p))],
      historyIndex: 0,
      selectedNodeId: null,
    });
  },

  addBlankPage: () => {
    const state = get();
    const newPage: Page = {
      id: `page-${uuid()}`,
      name: `Page ${state.pages.length + 1}`,
      width: 1440,
      height: 900,
      children: [],
    };
    const newPages = [...state.pages, newPage];
    set({
      pages: newPages,
      currentPageId: newPage.id,
      history: [JSON.parse(JSON.stringify(newPage))],
      historyIndex: 0,
      selectedNodeId: null,
    });
  },

  addPageAfter: (pageId) => {
    const state = get();
    const idx = state.pages.findIndex((p) => p.id === pageId);
    if (idx < 0) return;
    const newPage: Page = {
      id: `page-${uuid()}`,
      name: `Page ${state.pages.length + 1}`,
      width: 1440,
      height: 900,
      children: [],
    };
    const newPages = [
      ...state.pages.slice(0, idx + 1),
      newPage,
      ...state.pages.slice(idx + 1),
    ];
    set({
      pages: newPages,
      currentPageId: newPage.id,
      history: [JSON.parse(JSON.stringify(newPage))],
      historyIndex: 0,
      selectedNodeId: null,
    });
  },

  removePage: (pageId) => {
    const state = get();
    const idx = state.pages.findIndex((p) => p.id === pageId);
    if (idx < 0) return;
    const newPages = state.pages.filter((p) => p.id !== pageId);
    const nextCurrent =
      state.currentPageId === pageId
        ? newPages[Math.max(0, idx - 1)]?.id ?? newPages[0]?.id ?? null
        : state.currentPageId;
    const nextPage = nextCurrent ? newPages.find((p) => p.id === nextCurrent) : null;
    set({
      pages: newPages,
      currentPageId: nextCurrent,
      selectedNodeId: null,
      history: nextPage ? [JSON.parse(JSON.stringify(nextPage))] : [],
      historyIndex: nextPage ? 0 : -1,
    });
  },

  duplicatePage: (pageId) => {
    const state = get();
    const page = state.pages.find((p) => p.id === pageId);
    if (!page) return;
    const clone: Page = {
      ...JSON.parse(JSON.stringify(page)),
      id: `page-${uuid()}`,
      children: page.children.map((n) => cloneWithNewIds(n)),
    };
    const newPages = [...state.pages, clone];
    set({
      pages: newPages,
      currentPageId: clone.id,
      history: [JSON.parse(JSON.stringify(clone))],
      historyIndex: 0,
      selectedNodeId: null,
    });
  },

  updatePage: (pageId, updates) => {
    const state = get();
    const newPages = state.pages.map((p) =>
      p.id === pageId ? { ...p, ...updates } : p
    );
    set({ pages: newPages });
    if (state.currentPageId === pageId) {
      const updated = newPages.find((p) => p.id === pageId)!;
      set(pushHistory(state, updated));
    }
  },

  setProjectName: (name) => set({ projectName: name }),
  setOriginalScreenshot: (url) => set({ originalScreenshot: url }),
  selectNode: (id, pageId) => set({ selectedNodeId: id, selectedPageId: pageId ?? null }),
  setExportOpen: (open) => set({ isExportOpen: open }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setAlignmentGuides: (guides) => set({ alignmentGuides: guides }),

  // ── Node mutations (all record history for current page) ─────────────────

  updateNode: (id, updates) => {
    const state = get();
    const page = state.pages.find((p) => p.id === state.currentPageId);
    if (!page) return;
    const newPage = {
      ...page,
      children: updateNodeInTree(page.children, id, (node) => ({
        ...node,
        ...updates,
      })),
    };
    set(pushHistory(state, newPage));
  },

  deleteNode: (id) => {
    const state = get();
    const page = state.pages.find((p) => p.id === state.currentPageId);
    if (!page) return;
    const newPage = {
      ...page,
      children: removeNodeFromTree(page.children, id),
    };
    set({
      ...pushHistory(state, newPage),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    });
  },

  duplicateNode: (id) => {
    const state = get();
    const page = state.pages.find((p) => p.id === state.currentPageId);
    if (!page) return;
    const node = findNodeInTree(page.children, id);
    if (!node) return;
    const clone = cloneWithNewIds(node);
    const newPage = {
      ...page,
      children: [...page.children, clone],
    };
    set({ ...pushHistory(state, newPage), selectedNodeId: clone.id });
  },

  moveNode: (id, x, y) => {
    const state = get();
    const page = state.pages.find((p) => p.id === state.currentPageId);
    if (!page) return;
    const newPage = {
      ...page,
      children: updateNodeInTree(page.children, id, (node) => ({
        ...node,
        x: Math.max(0, x),
        y: Math.max(0, y),
      })),
    };
    set(pushHistory(state, newPage));
  },

  resizeNode: (id, width, height) => {
    const state = get();
    const page = state.pages.find((p) => p.id === state.currentPageId);
    if (!page) return;
    const newPage = {
      ...page,
      children: updateNodeInTree(page.children, id, (node) => ({
        ...node,
        width: Math.max(20, width),
        height: Math.max(20, height),
      })),
    };
    set(pushHistory(state, newPage));
  },

  // ── Silent updates (no history) ─────────────────────────

  updateNodeSilent: (id, updates) => {
    const state = get();
    const page = state.pages.find((p) => p.id === state.currentPageId);
    if (!page) return;
    const newPage = {
      ...page,
      children: updateNodeInTree(page.children, id, (node) => ({
        ...node,
        ...updates,
      })),
    };
    set({ pages: state.pages.map((p) => (p.id === newPage.id ? newPage : p)) });
  },

  commitToHistory: () => {
    const state = get();
    const page = state.pages.find((p) => p.id === state.currentPageId);
    if (!page) return;
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(page)));
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  // ── Undo / Redo ─────────────────────────────────────────

  undo: () => {
    const { history, historyIndex, currentPageId, pages } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const restored = JSON.parse(JSON.stringify(history[newIndex]));
    const newPages = pages.map((p) => (p.id === currentPageId ? restored : p));
    set({ pages: newPages, historyIndex: newIndex });
  },

  redo: () => {
    const { history, historyIndex, currentPageId, pages } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const restored = JSON.parse(JSON.stringify(history[newIndex]));
    const newPages = pages.map((p) => (p.id === currentPageId ? restored : p));
    set({ pages: newPages, historyIndex: newIndex });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  // ── Clipboard (Copy / Paste) ────────────────────────────

  copyNode: (id) => {
    const { pages, currentPageId } = get();
    const page = pages.find((p) => p.id === currentPageId);
    if (!page) return;
    const node = findNodeInTree(page.children, id);
    if (!node) return;
    
    const clone = deepCloneNode(node);
    set({ clipboard: clone });

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(JSON.stringify({ "unclash-component": true, node: clone }));
      }
    } catch (err) {
      console.warn("Failed to write to OS clipboard", err);
    }
  },

  pasteNode: async () => {
    const state = get();
    const page = state.pages.find((p) => p.id === state.currentPageId);
    if (!page) return;

    let nodeToPaste = state.clipboard;
    
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().startsWith("{") && text.includes("unclash-component")) {
          const parsed = JSON.parse(text);
          if (parsed["unclash-component"] && parsed.node) {
            nodeToPaste = parsed.node;
          }
        }
      }
    } catch (err) {
      // Ignore OS clipboard read errors (e.g. permission denied)
    }

    if (!nodeToPaste) return;

    const clone = cloneWithNewIds(nodeToPaste);

    // Smart Paste: if a container is selected, paste inside it.
    let targetParentId: string | null = null;
    if (state.selectedNodeId) {
      const selected = findNodeInTree(page.children, state.selectedNodeId);
      if (selected && ["container", "sidebar", "navbar", "card"].includes(selected.type)) {
        targetParentId = selected.id;
      }
    }

    let newPage: Page;
    if (targetParentId) {
      newPage = {
        ...page,
        children: updateNodeInTree(page.children, targetParentId, (parent) => ({
          ...parent,
          children: [...parent.children, clone],
        })),
      };
    } else {
      newPage = {
        ...page,
        children: [...page.children, clone],
      };
    }

    set({ ...pushHistory(state, newPage), selectedNodeId: clone.id });
  },

  // ── Code mode ───────────────────────────────────────────

  setCodeNodes: (nodes) => set({ codeNodes: nodes }),

  setSelectedElement: (id, info) => set({ selectedElementId: id, selectedElementInfo: info ?? null }),

  updateElementOverride: (pageId, elementId, override) => {
    const state = get();
    const page = state.pages.find((p) => p.id === pageId);
    if (!page) return;
    const existing = page.elementOverrides?.[elementId] ?? {};
    const merged: ElementOverride = { ...existing, ...override };
    const newPage: Page = {
      ...page,
      elementOverrides: { ...(page.elementOverrides ?? {}), [elementId]: merged },
    };
    set(pushHistory(state, newPage));
  },

  copyCodeElement: async (id) => {
    const { pages, currentPageId } = get();
    const page = pages.find((p) => p.id === currentPageId);
    if (!page || !page.code) return;
    
    const extracted = await extractElementCode(page.code, id);
    if (extracted) {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(JSON.stringify({ "unclash-code-element": true, code: extracted }));
        }
      } catch (err) {
        console.warn("Failed to write code to OS clipboard", err);
      }
    }
  },

  pasteCodeElement: async () => {
    const state = get();
    const { pages, currentPageId, selectedElementId } = state;
    const page = pages.find((p) => p.id === currentPageId);
    if (!page || !page.code || !selectedElementId) return;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().startsWith("{") && text.includes("unclash-code-element")) {
          const parsed = JSON.parse(text);
          if (parsed["unclash-code-element"] && parsed.code) {
            const modifiedCode = await insertElementCode(page.code, selectedElementId, parsed.code);
            if (modifiedCode) {
              const newPage = { ...page, code: modifiedCode };
              set(pushHistory(state, newPage));
            }
          }
        }
      }
    } catch (err) {
      console.warn("Failed to paste code element", err);
    }
  },

  duplicateCodeElement: async (id) => {
    const state = get();
    const { pages, currentPageId } = state;
    const page = pages.find((p) => p.id === currentPageId);
    if (!page || !page.code) return;

    const modifiedCode = await duplicateElementCode(page.code, id);
    if (modifiedCode) {
      const newPage = { ...page, code: modifiedCode };
      set(pushHistory(state, newPage));
    }
  },

  deleteCodeElement: async (id) => {
    const state = get();
    const { pages, currentPageId } = state;
    const page = pages.find((p) => p.id === currentPageId);
    if (!page || !page.code) return;

    const modifiedCode = await deleteElementCode(page.code, id);
    if (modifiedCode) {
      const newPage = { ...page, code: modifiedCode };
      set({ ...pushHistory(state, newPage), selectedElementId: null });
    }
  },

  // ── Helpers ─────────────────────────────────────────────

  getSelectedNode: () => {
    const { pages, currentPageId, selectedNodeId } = get();
    const page = pages.find((p) => p.id === currentPageId);
    if (!page || !selectedNodeId) return null;
    return findNodeInTree(page.children, selectedNodeId);
  },

  flatNodes: () => {
    const { pages, currentPageId } = get();
    const page = pages.find((p) => p.id === currentPageId);
    if (!page) return [];
    return flattenNodes(page.children);
  },
}));

// Selector for current page (backward compatibility)
export function useCurrentPage(): Page | null {
  const pages = useEditorStore((s) => s.pages);
  const currentPageId = useEditorStore((s) => s.currentPageId);
  return pages.find((p) => p.id === currentPageId) ?? null;
}
