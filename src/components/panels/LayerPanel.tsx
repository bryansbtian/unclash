"use client";

import { useEditorStore, useCurrentPage } from "@/store/editorStore";
import { WireframeNode, NodeType, CodeNode } from "@/types/schema";
import {
  Layers,
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
  Code2,
} from "lucide-react";

const TYPE_ICONS: Record<NodeType, React.ReactNode> = {
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

function LayerItem({
  node,
  depth = 0,
}: {
  node: WireframeNode;
  depth?: number;
}) {
  const { selectedNodeId, selectNode } = useEditorStore();
  const isSelected = selectedNodeId === node.id;

  return (
    <>
      <button
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs rounded-md transition-colors ${
          isSelected
            ? "bg-[var(--accent-muted)] text-indigo-300"
            : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => selectNode(node.id)}
      >
        <span className="flex-shrink-0 text-[var(--text-muted)]">
          {TYPE_ICONS[node.type] || <Square className="w-3.5 h-3.5" />}
        </span>
        <span className="truncate">
          {node.text?.split("\n")[0] || node.type}
        </span>
      </button>
      {node.children.map((child) => (
        <LayerItem key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

function CodeLayerItem({ node, depth = 0 }: { node: CodeNode; depth?: number }) {
  const { selectedElementId, setSelectedElement } = useEditorStore();
  const isSelected = selectedElementId === node.id;

  return (
    <>
      <button
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs rounded-md transition-colors ${
          isSelected
            ? "bg-[var(--accent-muted)] text-indigo-300"
            : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => setSelectedElement(isSelected ? null : node.id)}
      >
        <span className="flex-shrink-0 text-[var(--text-muted)]">
          <Code2 className="w-3.5 h-3.5" />
        </span>
        <span className="truncate font-mono">{node.tagName}</span>
        <span className="ml-auto truncate text-[10px] text-[var(--text-muted)]">{node.id}</span>
      </button>
      {node.children.map((child) => (
        <CodeLayerItem key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default function LayerPanel() {
  const page = useCurrentPage();
  const codeNodes = useEditorStore((s) => s.codeNodes);
  const isCodeMode = !!page?.code;

  if (!page) return null;

  const count = isCodeMode ? codeNodes.length : page.children.length;

  return (
    <div className="w-56 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <Layers className="w-4 h-4 text-[var(--text-muted)]" />
        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Layers
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-muted)] bg-white/5 px-1.5 py-0.5 rounded">
          {count}
        </span>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto py-2 px-1 flex flex-col gap-0.5">
        {isCodeMode
          ? codeNodes.map((node) => <CodeLayerItem key={node.id} node={node} />)
          : page.children.map((node) => <LayerItem key={node.id} node={node} />)}
      </div>
    </div>
  );
}
