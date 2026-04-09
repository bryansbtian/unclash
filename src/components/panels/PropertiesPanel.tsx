"use client";

import { useState, useCallback } from "react";
import { useEditorStore, useCurrentPage } from "@/store/editorStore";
import { NODE_TYPES, NodeType, WireframeNode, CodeNode } from "@/types/schema";
import {
  Square,
  PanelLeft,
  Navigation,
  CreditCard,
  Table,
  BarChart3,
  MousePointerClick,
  TextCursorInput,
  Type,
  Image,
  Plus,
  Share2,
  Play,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Rows3,
  Columns3,
  WrapText,
  Eye,
  HelpCircle,
  Link2,
  LayoutDashboard,
  ChevronRight,
  Box,
  List,
  MousePointer2,
  Minus,
  Hash,
} from "lucide-react";

type PanelTab = "design" | "layers" | "interaction";

// ── Figma-like Code Layer tree ────────────────────────────

function tagIcon(tag: string): React.ReactNode {
  if (['button', 'a'].includes(tag)) return <MousePointer2 className="w-3 h-3" />;
  if (['input', 'textarea', 'select'].includes(tag)) return <TextCursorInput className="w-3 h-3" />;
  if (['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label'].includes(tag)) return <Type className="w-3 h-3" />;
  if (['img'].includes(tag)) return <Image className="w-3 h-3" />;
  if (['ul', 'ol', 'li'].includes(tag)) return <List className="w-3 h-3" />;
  if (['hr'].includes(tag)) return <Minus className="w-3 h-3" />;
  if (['nav', 'header', 'footer'].includes(tag)) return <Navigation className="w-3 h-3" />;
  if (['aside'].includes(tag)) return <PanelLeft className="w-3 h-3" />;
  if (['table', 'tr', 'td', 'th', 'thead', 'tbody'].includes(tag)) return <Table className="w-3 h-3" />;
  return <Box className="w-3 h-3" />;
}

function sendGetRect(pageId: string, elementId: string) {
  const iframe = document.querySelector<HTMLIFrameElement>(`[title="canvas-${pageId}"]`);
  iframe?.contentWindow?.postMessage(
    { __unclash: true, type: 'get-rect', id: elementId },
    '*',
  );
}

function CodeLayerRow({
  node,
  depth,
  pageId,
  expandedIds,
  toggleExpand,
  onSelect,
}: {
  node: CodeNode;
  depth: number;
  pageId: string;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: () => void;
}) {
  const { selectedElementId, setSelectedElement } = useEditorStore();
  const isSelected = selectedElementId === node.id;
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;

  const handleClick = useCallback(() => {
    if (isSelected) {
      setSelectedElement(null);
    } else {
      setSelectedElement(node.id);
      sendGetRect(pageId, node.id);
      onSelect();
    }
  }, [isSelected, node.id, pageId, setSelectedElement, onSelect]);

  return (
    <>
      <div
        className={`group flex items-center gap-0 min-w-0 cursor-pointer select-none rounded-sm transition-colors ${
          isSelected
            ? 'bg-[#2a5fc4]/80 text-white'
            : 'hover:bg-white/5 text-[#c8c8d0]'
        }`}
        style={{ paddingLeft: depth * 16 + 4, paddingRight: 6, paddingTop: 3, paddingBottom: 3 }}
        onClick={handleClick}
      >
        {/* Expand chevron */}
        <button
          className={`w-4 h-4 flex items-center justify-center shrink-0 transition-transform ${
            isSelected ? 'text-white/70' : 'text-[#6b7280]'
          } ${hasChildren ? 'hover:text-white' : 'opacity-0 pointer-events-none'}`}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpand(node.id); }}
        >
          <ChevronRight
            className={`w-3 h-3 transition-transform duration-150 ${isExpanded && hasChildren ? 'rotate-90' : ''}`}
          />
        </button>

        {/* Icon */}
        <span className={`shrink-0 mr-1.5 ${isSelected ? 'text-white/80' : 'text-[#8b8b99]'}`}>
          {tagIcon(node.tagName)}
        </span>

        {/* Label — element id */}
        <span className="truncate text-[11px] font-medium flex-1 min-w-0">{node.id}</span>

        {/* Tag name badge */}
        <span className={`shrink-0 text-[9px] font-mono ml-2 ${isSelected ? 'text-white/50' : 'text-[#6b7280]'}`}>
          {node.tagName}
        </span>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && node.children.map((child) => (
        <CodeLayerRow
          key={child.id}
          node={child}
          depth={depth + 1}
          pageId={pageId}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function WireframeLayerRow({
  node,
  depth,
  expandedIds,
  toggleExpand,
  onSelect,
}: {
  node: WireframeNode;
  depth: number;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: () => void;
}) {
  const { selectedNodeId, selectNode } = useEditorStore();
  const isSelected = selectedNodeId === node.id;
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const icon = TYPE_ICONS_MAP[node.type] ?? <Box className="w-3 h-3" />;

  return (
    <>
      <div
        className={`group flex items-center gap-0 min-w-0 cursor-pointer select-none rounded-sm transition-colors ${
          isSelected
            ? 'bg-[#2a5fc4]/80 text-white'
            : 'hover:bg-white/5 text-[#c8c8d0]'
        }`}
        style={{ paddingLeft: depth * 16 + 4, paddingRight: 6, paddingTop: 3, paddingBottom: 3 }}
        onClick={() => { if (!isSelected) onSelect(); selectNode(isSelected ? null : node.id); }}
      >
        <button
          className={`w-4 h-4 flex items-center justify-center shrink-0 transition-transform ${
            isSelected ? 'text-white/70' : 'text-[#6b7280]'
          } ${hasChildren ? 'hover:text-white' : 'opacity-0 pointer-events-none'}`}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpand(node.id); }}
        >
          <ChevronRight
            className={`w-3 h-3 transition-transform duration-150 ${isExpanded && hasChildren ? 'rotate-90' : ''}`}
          />
        </button>
        <span className={`shrink-0 mr-1.5 ${isSelected ? 'text-white/80' : 'text-[#8b8b99]'}`}>
          {icon}
        </span>
        <span className="truncate text-[11px] font-medium flex-1 min-w-0">
          {node.text?.split('\n')[0] || node.type}
        </span>
        <span className={`shrink-0 text-[9px] font-mono ml-2 ${isSelected ? 'text-white/50' : 'text-[#6b7280]'}`}>
          {node.type}
        </span>
      </div>
      {hasChildren && isExpanded && node.children.map((child) => (
        <WireframeLayerRow
          key={child.id}
          node={child}
          depth={depth + 1}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function FigmaLayersPanel({ pageId, isCodeMode, onSelect }: { pageId: string; isCodeMode: boolean; onSelect: () => void }) {
  const page = useCurrentPage();
  const codeNodes = useEditorStore((s) => s.codeNodes);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!page) return null;

  const nodes = isCodeMode ? codeNodes : page.children;
  const count = nodes.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#1c1c1f]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <span className="text-[10px] font-semibold text-[#9999aa] uppercase tracking-widest">Layers</span>
        <span className="text-[9px] text-[#666677] bg-white/5 px-1.5 py-0.5 rounded">{count}</span>
      </div>

      {/* Page / frame row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
        <LayoutDashboard className="w-3 h-3 text-[#9999aa] shrink-0" />
        <span className="text-[11px] text-[#e0e0e8] font-medium truncate">{page.name || 'Page'}</span>
        <span className="ml-auto text-[9px] text-[#555566] font-mono">{page.width}×{page.height}</span>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Hash className="w-6 h-6 text-[#444455] mb-2" />
            <p className="text-[10px] text-[#555566]">
              {isCodeMode ? 'No elements yet — generate a design first' : 'No layers yet'}
            </p>
          </div>
        ) : isCodeMode ? (
          (nodes as CodeNode[]).map((node) => (
            <CodeLayerRow
              key={node.id}
              node={node}
              depth={0}
              pageId={pageId}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onSelect={onSelect}
            />
          ))
        ) : (
          (nodes as WireframeNode[]).map((node) => (
            <WireframeLayerRow
              key={node.id}
              node={node}
              depth={0}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Layer type icons ──────────────────────────────────────
const TYPE_ICONS_MAP: Record<NodeType, React.ReactNode> = {
  container: <Square className="w-3.5 h-3.5" />,
  sidebar: <PanelLeft className="w-3.5 h-3.5" />,
  navbar: <Navigation className="w-3.5 h-3.5" />,
  card: <CreditCard className="w-3.5 h-3.5" />,
  table: <Table className="w-3.5 h-3.5" />,
  chart: <BarChart3 className="w-3.5 h-3.5" />,
  button: <MousePointerClick className="w-3.5 h-3.5" />,
  input: <TextCursorInput className="w-3.5 h-3.5" />,
  text: <Type className="w-3.5 h-3.5" />,
  "image-placeholder": <Image className="w-3.5 h-3.5" />,
};


// ── Section header ────────────────────────────────────────
function SectionHeader({
  title,
  actionIcon,
}: {
  title: string;
  actionIcon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[11px] font-medium text-[var(--text-primary)]">
        {title}
      </span>
      {actionIcon && (
        <button className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          {actionIcon}
        </button>
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-[var(--border)]" />;
}

// ── Alignment grid button ─────────────────────────────────
function AlignButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded border transition-colors ${
        active
          ? "border-[#589df6] bg-[#589df6]/20 text-[#589df6]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

// ── Code element editor ───────────────────────────────────
function CodeElementEditor({ pageId }: { pageId: string }) {
  const { selectedElementId, selectedElementInfo, updateElementOverride, pages } = useEditorStore();
  const page = pages.find((p) => p.id === pageId);
  const overrides = (page?.elementOverrides ?? {})[selectedElementId ?? ''] ?? {};
  const info = selectedElementInfo;

  const update = (override: import('@/types/schema').ElementOverride) => {
    if (!selectedElementId) return;
    updateElementOverride(pageId, selectedElementId, override);
  };

  // Notify the iframe of live style updates so it's instant
  const notifyIframe = (styles: Record<string, string>) => {
    const iframes = document.querySelectorAll<HTMLIFrameElement>(`[title="canvas-${pageId}"]`);
    iframes.forEach((iframe) => {
      iframe.contentWindow?.postMessage(
        { __unclash: true, type: 'update-style', id: selectedElementId, styles },
        '*',
      );
    });
  };

  const notifyText = (text: string) => {
    const iframes = document.querySelectorAll<HTMLIFrameElement>(`[title="canvas-${pageId}"]`);
    iframes.forEach((iframe) => {
      iframe.contentWindow?.postMessage(
        { __unclash: true, type: 'update-text', id: selectedElementId, text },
        '*',
      );
    });
  };

  if (!selectedElementId || !info) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
          <Square className="w-5 h-5 text-[var(--text-muted)]" />
        </div>
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Click any element in the canvas<br />or select a layer to edit it.
        </p>
      </div>
    );
  }

  const bgColor = overrides.backgroundColor ?? info.styles.backgroundColor;
  const textColor = overrides.color ?? info.styles.color;
  const fontSize = overrides.fontSize ?? info.styles.fontSize;
  const borderRadius = overrides.borderRadius ?? info.styles.borderRadius;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Element identity */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono bg-[#589df6]/10 text-[#589df6] px-1.5 py-0.5 rounded border border-[#589df6]/20">
            &lt;{info.tagName}&gt;
          </span>
          <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
            #{selectedElementId}
          </span>
        </div>
        <p className="text-[10px] text-[var(--text-muted)]">
          {Math.round(info.styles.width)} × {Math.round(info.styles.height)} px
        </p>
      </div>

      {/* ── Text content ── show first if element has text */}
      {(info.textContent || overrides.textContent !== undefined) && (
        <>
          <SectionHeader title="Content" />
          <div className="px-4 pb-3">
            <textarea
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 py-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6] resize-none"
              rows={2}
              value={overrides.textContent ?? info.textContent}
              onChange={(e) => {
                notifyText(e.target.value);
                update({ textContent: e.target.value });
              }}
            />
          </div>
          <Divider />
        </>
      )}

      {/* ── Fill / Background ── */}
      <SectionHeader title="Fill" />
      <div className="px-4 pb-3 flex items-center gap-3">
        <input
          type="color"
          className="w-8 h-8 rounded border border-[var(--border)] cursor-pointer p-0.5 bg-[var(--bg-elevated)] shrink-0"
          value={cssColorToHex(bgColor)}
          onChange={(e) => { notifyIframe({ backgroundColor: e.target.value }); update({ backgroundColor: e.target.value }); }}
        />
        <input
          type="text"
          className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6] font-mono"
          value={overrides.backgroundColor ?? ''}
          placeholder={bgColor}
          onChange={(e) => { notifyIframe({ backgroundColor: e.target.value }); update({ backgroundColor: e.target.value }); }}
        />
      </div>

      <Divider />

      {/* ── Typography ── */}
      <SectionHeader title="Typography" />
      <div className="px-4 pb-3 space-y-2">
        {/* Text color */}
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="w-6 h-6 rounded border border-[var(--border)] cursor-pointer p-0 bg-[var(--bg-elevated)] shrink-0"
            value={cssColorToHex(textColor)}
            onChange={(e) => { notifyIframe({ color: e.target.value }); update({ color: e.target.value }); }}
          />
          <span className="text-[10px] text-[var(--text-muted)] w-8 shrink-0">Color</span>
          <input
            type="text"
            className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6] font-mono"
            value={overrides.color ?? ''}
            placeholder={textColor}
            onChange={(e) => { notifyIframe({ color: e.target.value }); update({ color: e.target.value }); }}
          />
        </div>
        {/* Font size */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)] w-8 shrink-0 ml-8">Size</span>
          <input
            type="text"
            className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6]"
            value={overrides.fontSize ?? ''}
            placeholder={fontSize || '14px'}
            onChange={(e) => { notifyIframe({ fontSize: e.target.value }); update({ fontSize: e.target.value }); }}
          />
        </div>
        {/* Font weight */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)] w-8 shrink-0 ml-8">Weight</span>
          <select
            className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6]"
            value={overrides.fontWeight ?? info.styles.fontWeight}
            onChange={(e) => { notifyIframe({ fontWeight: e.target.value }); update({ fontWeight: e.target.value }); }}
          >
            {[['100','Thin'],['200','Extra Light'],['300','Light'],['400','Regular'],['500','Medium'],['600','Semi Bold'],['700','Bold'],['800','Extra Bold'],['900','Black']].map(([v, l]) => (
              <option key={v} value={v}>{l} ({v})</option>
            ))}
          </select>
        </div>
      </div>

      <Divider />

      {/* ── Size ── */}
      <SectionHeader title="Size" />
      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1.5">
          <span className="text-[10px] text-[var(--text-muted)] font-medium w-4 shrink-0">W</span>
          <input
            type="text"
            className="flex-1 bg-transparent text-[11px] text-[var(--text-primary)] outline-none w-0 min-w-0"
            value={overrides.width ?? ''}
            placeholder={`${Math.round(info.styles.width)}px`}
            onChange={(e) => { notifyIframe({ width: e.target.value }); update({ width: e.target.value }); }}
          />
        </div>
        <div className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1.5">
          <span className="text-[10px] text-[var(--text-muted)] font-medium w-4 shrink-0">H</span>
          <input
            type="text"
            className="flex-1 bg-transparent text-[11px] text-[var(--text-primary)] outline-none w-0 min-w-0"
            value={overrides.height ?? ''}
            placeholder={`${Math.round(info.styles.height)}px`}
            onChange={(e) => { notifyIframe({ height: e.target.value }); update({ height: e.target.value }); }}
          />
        </div>
      </div>

      <Divider />

      {/* ── Padding ── */}
      <SectionHeader title="Padding" />
      <div className="px-4 pb-3">
        <input
          type="text"
          className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6]"
          value={overrides.padding ?? ''}
          placeholder="e.g. 8px 16px"
          onChange={(e) => { notifyIframe({ padding: e.target.value }); update({ padding: e.target.value }); }}
        />
      </div>

      <Divider />

      {/* ── Border radius ── */}
      <SectionHeader title="Corner radius" />
      <div className="px-4 pb-3">
        <input
          type="text"
          className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6]"
          value={overrides.borderRadius ?? ''}
          placeholder={borderRadius || '0px'}
          onChange={(e) => { notifyIframe({ borderRadius: e.target.value }); update({ borderRadius: e.target.value }); }}
        />
      </div>
    </div>
  );
}

/** Convert rgb(...) or rgba(...) to #hex for color input */
function cssColorToHex(css: string): string {
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(Number(m[1]))}${toHex(Number(m[2]))}${toHex(Number(m[3]))}`;
}

export default function PropertiesPanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>("design");
  const { selectedNodeId, updateNode, pages, currentPageId, setCurrentPage, addBlankPage, selectedElementId } = useEditorStore();
  const page = useCurrentPage();
  const isCodeMode = !!(page?.code);

  const selectedNode = (() => {
    if (!page || !selectedNodeId) return null;
    const find = (
      nodes: typeof page.children,
    ): (typeof page.children)[0] | null => {
      for (const n of nodes) {
        if (n.id === selectedNodeId) return n;
        const found = find(n.children);
        if (found) return found;
      }
      return null;
    };
    return find(page.children);
  })();

  const meta = (selectedNode?.metadata || {}) as Record<string, unknown>;
  const rotation = (meta.rotation as number) ?? 0;
  const paddingH = (meta.paddingH as number) ?? 0;
  const paddingV = (meta.paddingV as number) ?? 0;
  const clipContent = (meta.clipContent as boolean) ?? false;
  const visible = (meta.visible as boolean) ?? true;

  const setMeta = (key: string, value: unknown) => {
    if (!selectedNode) return;
    updateNode(selectedNode.id, {
      metadata: { ...meta, [key]: value },
    });
  };

  return (
    <div className="w-[300px] bg-[var(--bg-secondary)] border-l border-[var(--border)] flex flex-col overflow-hidden">
      {/* Pages section */}
      <div className="shrink-0 border-b border-[var(--border)]">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-[11px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">Pages</span>
          <button onClick={addBlankPage} className="p-1 rounded text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)] transition-colors" title="Add page">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="px-2 pb-2 flex flex-col gap-0.5 max-h-36 overflow-y-auto">
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => setCurrentPage(p.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${
                currentPageId === p.id
                  ? 'bg-[#589df6]/15 text-[#589df6] font-medium'
                  : 'text-[var(--text-secondary)] hover:bg-slate-50 hover:text-[var(--text-primary)]'
              }`}
            >
              <LayoutDashboard className="w-3 h-3 shrink-0 opacity-60" />
              <span className="truncate">{p.name || p.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Header: Share, zoom, etc. */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <button className="p-1.5 rounded text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)] transition-colors" title="Share">
          <Share2 className="w-4 h-4" />
        </button>
        <button className="p-1.5 rounded text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)] transition-colors" title="Preview">
          <Play className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs: Design | Interaction */}
      <div className="flex border-b border-[var(--border)]">
        {[
          { id: "design" as PanelTab, label: "Design" },
          { id: "interaction" as PanelTab, label: "Interaction" },
          { id: "layers" as PanelTab, label: "Layers" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
              activeTab === tab.id
                ? "text-[var(--text-primary)] border-b-2 border-[#589df6]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "layers" ? (
        page ? <FigmaLayersPanel pageId={page.id} isCodeMode={isCodeMode} onSelect={() => setActiveTab('design')} /> : null
      ) : activeTab === "interaction" ? (
        <div className="flex-1 overflow-y-auto p-4">
          <SectionHeader title="Link" actionIcon={<Plus className="w-3.5 h-3.5" />} />
          <div className="px-4 pt-2">
            <button className="flex items-center gap-2 w-full px-3 py-2 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-secondary)] transition-colors">
              <Link2 className="w-3.5 h-3.5" />
              Add link
            </button>
          </div>
        </div>
      ) : (
        /* ── Design tab ───────────────────────────────────── */
        <div className="flex-1 overflow-y-auto">
          {isCodeMode ? (
            <CodeElementEditor pageId={page!.id} />
          ) : selectedNode ? (
            <>
              <SectionHeader title="Position" />
              <div className="px-4 pb-3 space-y-2">
                <div className="text-[10px] text-[var(--text-muted)] mb-1">Relative</div>
                <div className="grid grid-cols-3 gap-1">
                  <AlignButton onClick={() => {}}><AlignLeft className="w-3.5 h-3.5" /></AlignButton>
                  <AlignButton onClick={() => {}}><AlignCenter className="w-3.5 h-3.5" /></AlignButton>
                  <AlignButton onClick={() => {}}><AlignRight className="w-3.5 h-3.5" /></AlignButton>
                  <AlignButton onClick={() => {}}><AlignStartVertical className="w-3.5 h-3.5" /></AlignButton>
                  <AlignButton onClick={() => {}}><AlignCenterVertical className="w-3.5 h-3.5" /></AlignButton>
                  <AlignButton onClick={() => {}}><AlignEndVertical className="w-3.5 h-3.5" /></AlignButton>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-[var(--text-muted)]">Rotation</span>
                  <input
                    type="number"
                    className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)] w-14"
                    value={rotation}
                    onChange={(e) => setMeta("rotation", parseInt(e.target.value) || 0)}
                  />
                  <span className="text-[10px] text-[var(--text-muted)]">°</span>
                </div>
              </div>

              <Divider />
              <SectionHeader title="Auto layout" />
              <div className="px-4 pb-3 flex gap-1">
                <button className="p-2 rounded border border-[var(--border)] text-[var(--text-muted)] hover:bg-slate-100" title="Horizontal">
                  <Rows3 className="w-4 h-4" />
                </button>
                <button className="p-2 rounded border border-[var(--border)] text-[var(--text-muted)] hover:bg-slate-100" title="Vertical">
                  <Columns3 className="w-4 h-4" />
                </button>
                <button className="p-2 rounded border border-[var(--border)] text-[var(--text-muted)] hover:bg-slate-100" title="Wrap">
                  <WrapText className="w-4 h-4" />
                </button>
              </div>

              <Divider />
              <SectionHeader title="Resizing" />
              <div className="px-4 pb-3 space-y-2">
                <div className="flex items-center gap-2">
                  <FieldInput
                    label="W"
                    value={selectedNode.width}
                    onChange={(v) => updateNode(selectedNode.id, { width: Math.max(20, v) })}
                  />
                  <span className="text-[10px] text-[var(--text-muted)]">Fill</span>
                </div>
                <div className="flex items-center gap-2">
                  <FieldInput
                    label="H"
                    value={selectedNode.height}
                    onChange={(v) => updateNode(selectedNode.id, { height: Math.max(20, v) })}
                  />
                  <span className="text-[10px] text-[var(--text-muted)]">Hug</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-muted)] w-6">Gap</span>
                  <input
                    type="number"
                    className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)]"
                    defaultValue={20}
                  />
                </div>
              </div>

              <Divider />
              <SectionHeader title="Padding" />
              <div className="px-4 pb-3 flex gap-2">
                <FieldInput label="H" value={paddingH} onChange={(v) => setMeta("paddingH", v)} />
                <FieldInput label="V" value={paddingV} onChange={(v) => setMeta("paddingV", v)} />
              </div>

              <Divider />
              <div className="px-4 py-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="clip"
                  checked={clipContent}
                  onChange={(e) => setMeta("clipContent", e.target.checked)}
                  className="rounded border-[var(--border)]"
                />
                <label htmlFor="clip" className="text-[11px] text-[var(--text-primary)]">Clip content</label>
              </div>

              <Divider />
              <SectionHeader title="Appearance" />
              <div className="px-4 pb-3 flex items-center gap-2">
                <button className="p-1.5 rounded text-[var(--text-muted)] hover:bg-slate-100" title="Visibility">
                  <Eye className="w-4 h-4" />
                </button>
                <button className="p-1.5 rounded text-[var(--text-muted)] hover:bg-slate-100" title="Help">
                  <HelpCircle className="w-4 h-4" />
                </button>
                <label className="flex items-center gap-2 ml-2">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => setMeta("visible", e.target.checked)}
                    className="rounded border-[var(--border)]"
                  />
                  <span className="text-[11px] text-[var(--text-primary)]">Visible</span>
                </label>
              </div>

              <Divider />
              <SectionHeader title="Type" />
              <div className="px-4 pb-3">
                <select
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6]"
                  value={selectedNode.type}
                  onChange={(e) =>
                    updateNode(selectedNode.id, { type: e.target.value as NodeType })
                  }
                >
                  {NODE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <Divider />
              <SectionHeader title="Content" />
              <div className="px-4 pb-3">
                <textarea
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 py-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6] resize-none"
                  rows={3}
                  placeholder="Enter text…"
                  value={selectedNode.text || ""}
                  onChange={(e) =>
                    updateNode(selectedNode.id, { text: e.target.value })
                  }
                />
              </div>

              <Divider />
              <SectionHeader title="Text" />
              <div className="px-4 pb-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-muted)] w-10">Font</span>
                  <select
                    className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6]"
                    value={selectedNode.styles?.fontFamily || 'Inter'}
                    onChange={(e) =>
                      updateNode(selectedNode.id, {
                        styles: { ...selectedNode.styles, fontFamily: e.target.value },
                      })
                    }
                  >
                    {[
                      'Inter',
                      'Arial',
                      'Helvetica',
                      'Verdana',
                      'Georgia',
                      'Times New Roman',
                      'Courier New',
                      'Roboto',
                      'Open Sans',
                      'Lato',
                      'Montserrat',
                      'Poppins',
                      'Raleway',
                      'Nunito',
                      'Playfair Display',
                      'Merriweather',
                      'Source Code Pro',
                      'Fira Code',
                      'JetBrains Mono',
                      'SF Pro Display',
                      'system-ui',
                    ].map((f) => (
                      <option key={f} value={f} style={{ fontFamily: f }}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-muted)] w-10">Size</span>
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      type="number"
                      min={6}
                      max={200}
                      className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6] w-0 min-w-0"
                      value={parseInt(selectedNode.styles?.fontSize || '14', 10)}
                      onChange={(e) =>
                        updateNode(selectedNode.id, {
                          styles: {
                            ...selectedNode.styles,
                            fontSize: `${Math.max(6, Math.min(200, parseInt(e.target.value) || 14))}px`,
                          },
                        })
                      }
                    />
                    <span className="text-[10px] text-[var(--text-muted)]">px</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-muted)] w-10">Weight</span>
                  <select
                    className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#589df6]"
                    value={selectedNode.styles?.fontWeight || '400'}
                    onChange={(e) =>
                      updateNode(selectedNode.id, {
                        styles: { ...selectedNode.styles, fontWeight: e.target.value },
                      })
                    }
                  >
                    <option value="100">Thin</option>
                    <option value="200">Extra Light</option>
                    <option value="300">Light</option>
                    <option value="400">Regular</option>
                    <option value="500">Medium</option>
                    <option value="600">Semi Bold</option>
                    <option value="700">Bold</option>
                    <option value="800">Extra Bold</option>
                    <option value="900">Black</option>
                  </select>
                </div>
              </div>

              <Divider />
              <SectionHeader title="Export" actionIcon={<Plus className="w-3.5 h-3.5" />} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
                <Square className="w-5 h-5 text-[var(--text-muted)]" />
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Select an element on the canvas to
                <br />
                inspect and edit its properties.
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 py-1 flex-1">
      <span className="text-[10px] text-[var(--text-muted)] font-medium w-3">{label}</span>
      <input
        type="number"
        className="flex-1 bg-transparent text-[11px] text-[var(--text-primary)] outline-none w-0 min-w-0"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
      />
    </div>
  );
}
