"use client";

import { useState, useRef, useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Circle,
  Code2,
  Compass,
  FileText,
  Folder,
  Gift,
  HelpCircle,
  History,
  Home,
  ImageIcon,
  LayoutGrid,
  MessageSquare,
  MessagesSquare,
  Mic,
  MoonStar,
  PanelLeft,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Sun,
  SunMoon,
  UserRound,
  Users,
} from "lucide-react";
import { useEditorStore, useCurrentPage } from "@/store/editorStore";
import { WireframeNode, NodeType } from "@/types/schema";
import { snapToGrid } from "./Canvas";
import { computeSnap } from "./alignmentGuides";

// ── Light-mode type styles ──────────────────────────────────
const TYPE_STYLES: Record<
  NodeType,
  { bg: string; border: string; label: string }
> = {
  container:           { bg: "#ffffff",     border: "#e2e8f0", label: "BOX"  },
  sidebar:             { bg: "#f8fafc",     border: "#e2e8f0", label: "SID"  },
  navbar:              { bg: "#ffffff",     border: "#e2e8f0", label: "NAV"  },
  card:                { bg: "#ffffff",     border: "#e2e8f0", label: "CARD" },
  table:               { bg: "#ffffff",     border: "#e2e8f0", label: "TBL"  },
  chart:               { bg: "#ffffff",     border: "#e2e8f0", label: "CHT"  },
  button:              { bg: "#6366f1",     border: "#6366f1", label: "BTN"  },
  input:               { bg: "#ffffff",     border: "#d1d5db", label: "IN"   },
  text:                { bg: "transparent", border: "transparent", label: "TXT" },
  "image-placeholder": { bg: "#f1f5f9",     border: "#e2e8f0", label: "IMG"  },
};

const ICON_COMPONENTS: Record<string, LucideIcon> = {
  bell: Bell,
  circle: Circle,
  "code-2": Code2,
  compass: Compass,
  "file-text": FileText,
  folder: Folder,
  gift: Gift,
  "help-circle": HelpCircle,
  history: History,
  home: Home,
  image: ImageIcon,
  layout: LayoutGrid,
  "message-square": MessageSquare,
  "messages-square": MessagesSquare,
  mic: Mic,
  "moon-star": MoonStar,
  "panel-left": PanelLeft,
  paperclip: Paperclip,
  pencil: Pencil,
  plus: Plus,
  search: Search,
  send: Send,
  settings: Settings,
  sparkles: Sparkles,
  sun: Sun,
  "sun-moon": SunMoon,
  "user-round": UserRound,
  users: Users,
};

function parseNumericStyle(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function normalizeTextAlign(value: string): "left" | "center" | "right" | undefined {
  const lower = value.toLowerCase();
  if (lower === "center") return "center";
  if (lower === "right" || lower === "end") return "right";
  if (lower === "left" || lower === "start") return "left";
  return undefined;
}

function normalizeAlignItems(
  value: string,
): "flex-start" | "center" | "flex-end" | "stretch" | undefined {
  const lower = value.toLowerCase();
  if (lower === "start" || lower === "left" || lower === "top") return "flex-start";
  if (lower === "end" || lower === "right" || lower === "bottom") return "flex-end";
  if (lower === "center" || lower === "middle") return "center";
  if (lower === "stretch") return "stretch";
  return undefined;
}

function normalizeJustifyContent(
  value: string,
): "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | undefined {
  const lower = value.toLowerCase();
  if (lower === "start" || lower === "left" || lower === "top") return "flex-start";
  if (lower === "end" || lower === "right" || lower === "bottom") return "flex-end";
  if (lower === "center" || lower === "middle") return "center";
  if (lower === "between" || lower === "space-between") return "space-between";
  if (lower === "around" || lower === "space-around") return "space-around";
  return undefined;
}

function resolveBorderRadius(value?: string, fallback?: string): string | undefined {
  const source = (value || fallback || "").toLowerCase();
  if (!source) return undefined;
  if (source === "pill" || source === "full" || source === "9999px") return "9999px";
  const numeric = parseNumericStyle(source);
  return numeric != null ? `${numeric}px` : fallback;
}

// ── Light-mode visual surface resolver ─────────────────────
function resolveVisualSurface(
  baseBackground: string,
  baseBorder: string,
  surface: string,
  emphasis: string,
  nodeType: NodeType,
): { background: string; borderColor: string } {
  const isAction = nodeType === "button";

  if (surface === "ghost") {
    return { background: "transparent", borderColor: "transparent" };
  }
  if (surface === "outline") {
    return {
      background: nodeType === "input" ? "#ffffff" : "transparent",
      borderColor: emphasis === "primary" ? "#6366f1" : "#d1d5db",
    };
  }
  if (surface === "muted") {
    return { background: "#f1f5f9", borderColor: "#e2e8f0" };
  }
  if (emphasis === "primary" && isAction) {
    return { background: "#6366f1", borderColor: "#6366f1" };
  }
  if (emphasis === "secondary") {
    return { background: "#f8fafc", borderColor: "#e2e8f0" };
  }
  return { background: baseBackground, borderColor: baseBorder };
}

/** Derive button text/icon color from surface + emphasis. */
function getButtonFgColor(surface: string, emphasis: string): string {
  if (surface === "ghost" || surface === "outline") return "#6366f1";
  if (surface === "muted") return "#374151";
  if (emphasis === "secondary") return "#374151";
  return "#ffffff"; // filled / primary
}

interface Props {
  node: WireframeNode;
  pageId?: string;
  depth?: number;
  onSelectInPage?: () => void;
}

export default function WireframeBlock({
  node,
  pageId,
  depth = 0,
  onSelectInPage,
}: Props) {
  void pageId;

  const page = useCurrentPage();
  const {
    selectedNodeId,
    activeTool,
    selectNode,
    updateNode,
    updateNodeSilent,
    commitToHistory,
    flatNodes,
    setAlignmentGuides,
  } = useEditorStore();

  const isSelected = selectedNodeId === node.id;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(node.text || "");
  const blockRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    nodeX: number;
    nodeY: number;
  } | null>(null);
  const resizeState = useRef<{
    startX: number;
    startY: number;
    nodeW: number;
    nodeH: number;
    nodeX: number;
    nodeY: number;
    handle: string;
  } | null>(null);

  const style = TYPE_STYLES[node.type] || TYPE_STYLES.container;
  const meta = (node.metadata || {}) as Record<string, unknown>;
  const rotation = (meta.rotation as number) ?? 0;
  const visible = (meta.visible as boolean) ?? true;
  const kind = (meta.kind as string) || "";
  const semanticType = (meta.semanticType as string) || "";
  const iconName = (meta.iconName as string) || "";
  const hideChrome = Boolean(meta.hideChrome);
  const iconOnly = Boolean(meta.iconOnly);
  const leadingIcon = Boolean(meta.leadingIcon);
  const iconPlacement = (meta.iconPlacement as string) || node.styles?.iconPlacement || "";
  const Icon = iconName ? ICON_COMPONENTS[iconName] : undefined;
  const isTinyNode = node.width < 72 || node.height < 28;
  const isCompactNode = node.width < 110 || node.height < 42;
  const showTypeBadge = isSelected;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;
      if (activeTool === "hand") return;
      e.stopPropagation();
      onSelectInPage?.();
      selectNode(node.id);
      if (activeTool !== "move") return;

      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        nodeX: node.x,
        nodeY: node.y,
      };

      const siblings = flatNodes().filter((n) => n.id !== node.id);
      const pageW = page?.width ?? 1440;
      const pageH = page?.height ?? 900;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const dx = ev.clientX - dragState.current.startX;
        const dy = ev.clientY - dragState.current.startY;
        const rawX = snapToGrid(dragState.current.nodeX + dx);
        const rawY = snapToGrid(dragState.current.nodeY + dy);

        const snap = computeSnap(
          rawX,
          rawY,
          node.width,
          node.height,
          siblings,
          pageW,
          pageH,
        );

        updateNodeSilent(node.id, {
          x: Math.max(0, snap.x),
          y: Math.max(0, snap.y),
        });
        setAlignmentGuides(snap.guides);
      };

      const handleMouseUp = () => {
        dragState.current = null;
        setAlignmentGuides([]);
        commitToHistory();
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [
      activeTool,
      commitToHistory,
      flatNodes,
      isEditing,
      node.height,
      node.id,
      node.width,
      node.x,
      node.y,
      onSelectInPage,
      page,
      selectNode,
      setAlignmentGuides,
      updateNodeSilent,
    ],
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, handle: string) => {
      e.stopPropagation();
      e.preventDefault();
      resizeState.current = {
        startX: e.clientX,
        startY: e.clientY,
        nodeW: node.width,
        nodeH: node.height,
        nodeX: node.x,
        nodeY: node.y,
        handle,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizeState.current) return;

        const dx = ev.clientX - resizeState.current.startX;
        const dy = ev.clientY - resizeState.current.startY;
        const h = resizeState.current.handle;
        let newW = resizeState.current.nodeW;
        let newH = resizeState.current.nodeH;
        let newX = resizeState.current.nodeX;
        let newY = resizeState.current.nodeY;

        if (h.includes("e")) newW = snapToGrid(resizeState.current.nodeW + dx);
        if (h.includes("s")) newH = snapToGrid(resizeState.current.nodeH + dy);
        if (h.includes("w")) {
          newW = snapToGrid(resizeState.current.nodeW - dx);
          newX = snapToGrid(resizeState.current.nodeX + dx);
        }
        if (h.includes("n")) {
          newH = snapToGrid(resizeState.current.nodeH - dy);
          newY = snapToGrid(resizeState.current.nodeY + dy);
        }

        if (newW >= 20 && newH >= 20) {
          const updates: Partial<WireframeNode> = {
            width: newW,
            height: newH,
          };
          if (h.includes("w") || h.includes("n")) {
            updates.x = newX;
            updates.y = newY;
          }
          updateNodeSilent(node.id, updates);
        }
      };

      const handleMouseUp = () => {
        resizeState.current = null;
        commitToHistory();
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [commitToHistory, node.height, node.id, node.width, node.x, node.y, updateNodeSilent],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditing(true);
      setEditText(node.text || "");
    },
    [node.text],
  );

  const handleTextSubmit = useCallback(() => {
    setIsEditing(false);
    updateNode(node.id, { text: editText });
  }, [editText, node.id, updateNode]);

  const hasCustomFont = !!(
    node.styles?.fontSize ||
    node.styles?.fontFamily ||
    node.styles?.fontWeight
  );
  const shouldHideText = isTinyNode && !isEditing;
  const paddingH =
    parseNumericStyle(node.styles?.paddingX) ??
    parseNumericStyle(node.styles?.paddingH) ??
    ((meta.paddingH as number) ?? undefined);
  const paddingV =
    parseNumericStyle(node.styles?.paddingY) ??
    parseNumericStyle(node.styles?.paddingV) ??
    ((meta.paddingV as number) ?? undefined);
  const gap =
    parseNumericStyle(node.styles?.gap) ??
    ((meta.gap as number) ?? undefined);
  const textAlign = normalizeTextAlign(
    (node.styles?.textAlign as string) ||
    ((meta.textAlign as string) ?? ""),
  );
  const alignItems = normalizeAlignItems(
    (node.styles?.alignItems as string) ||
    ((meta.alignItems as string) ?? ""),
  );
  const justifyContent = normalizeJustifyContent(
    (node.styles?.justifyContent as string) ||
    ((meta.justifyContent as string) ?? ""),
  );
  const surface = ((meta.surface as string) || node.styles?.surface || "").toLowerCase();
  const emphasis = ((meta.emphasis as string) || node.styles?.emphasis || "").toLowerCase();
  const borderRadius = resolveBorderRadius(
    node.styles?.borderRadius,
    kind === "ellipse" ? "9999px" : undefined,
  );
  const contentSpacingStyle = {
    paddingLeft: paddingH,
    paddingRight: paddingH,
    paddingTop: paddingV,
    paddingBottom: paddingV,
    gap,
    alignItems,
    justifyContent,
    textAlign,
  };
  const truncateStyle = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  };

  const renderIcon = (className: string, fallback: string = "•") => {
    if (Icon) return <Icon className={className} strokeWidth={1.8} />;
    return <span className={className}>{fallback}</span>;
  };

  // Light-mode surface backgrounds for section / frame / regular nodes
  const visualSurface = resolveVisualSurface(
    kind === "section"
      ? "rgba(99, 102, 241, 0.04)"
      : kind === "frame"
        ? "rgba(248, 250, 252, 0.9)"
        : style.bg,
    style.border,
    surface,
    emphasis,
    node.type,
  );
  const opacity = parseNumericStyle(node.styles?.opacity);
  const showLeadingIcon = (leadingIcon || iconPlacement === "leading") && Icon;
  const showTrailingIcon = iconPlacement === "trailing" && Icon;

  const renderContent = () => {
    if (isEditing) {
      return (
        <input
          autoFocus
          className="inline-edit"
          style={{
            fontSize: "inherit",
            fontFamily: "inherit",
            fontWeight: "inherit",
          }}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleTextSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleTextSubmit();
            if (e.key === "Escape") setIsEditing(false);
          }}
        />
      );
    }

    if (kind === "text-box" || (node.type === "text" && hasCustomFont)) {
      if (shouldHideText) return null;
      return (
        <div
          className="flex items-center w-full h-full min-w-0 overflow-hidden"
          style={contentSpacingStyle}
        >
          <span
            style={{
              ...truncateStyle,
              fontSize: "inherit",
              fontFamily: "inherit",
              fontWeight: "inherit",
              color: node.styles?.color || "#1e293b",
            }}
          >
            {node.text || "Text"}
          </span>
        </div>
      );
    }

    if (node.type === "container" && hideChrome) {
      return null;
    }

    const textLines = (node.text || "").split("\n");

    if (kind === "line") {
      return <div className="w-full h-full bg-slate-400" />;
    }

    if (kind === "arrow") {
      return (
        <div className="relative w-full h-full">
          <div className="absolute left-0 right-2 top-1/2 -translate-y-1/2 h-[2px] bg-slate-400" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">{">"}</div>
        </div>
      );
    }

    if (kind === "comment") {
      return (
        <div
          className="w-full h-full bg-amber-50 border border-amber-200 rounded-md overflow-hidden"
          style={contentSpacingStyle}
        >
          <span
            className="text-amber-700 block"
            style={{
              ...(isCompactNode ? truncateStyle : {}),
              fontSize: hasCustomFont ? "inherit" : "0.75rem",
            }}
          >
            {node.text || "Comment"}
          </span>
        </div>
      );
    }

    switch (node.type) {
      case "text":
        if (shouldHideText) return null;
        return (
          <div
            className="flex items-center w-full h-full min-w-0 overflow-hidden"
            style={contentSpacingStyle}
          >
            <span
              style={{
                ...truncateStyle,
                fontSize: "inherit",
                fontWeight: "inherit",
                color: node.styles?.color || "#64748b",
              }}
            >
              {node.text || "Text"}
            </span>
          </div>
        );

      case "chart":
        return (
          <div className="flex flex-col items-center justify-center w-full h-full gap-2 overflow-hidden px-2">
            <span
              className={isCompactNode ? "text-sm font-semibold" : "text-lg font-semibold"}
              style={{ color: "#cbd5e1" }}
            >
              CHT
            </span>
            {!shouldHideText && (
              <span
                className="text-xs text-center w-full"
                style={{ ...truncateStyle, color: "#94a3b8" }}
              >
                {node.text || "Chart Placeholder"}
              </span>
            )}
            {!isTinyNode && (
              <div className="flex items-end gap-1 h-8">
                {[30, 60, 40, 80, 50, 70, 90].map((h, i) => (
                  <div
                    key={i}
                    className="w-2 rounded-t"
                    style={{ height: `${h}%`, background: "#c7d2fe" }}
                  />
                ))}
              </div>
            )}
          </div>
        );

      case "table":
        return (
          <div
            className="w-full h-full flex flex-col overflow-hidden"
            style={contentSpacingStyle}
          >
            {!shouldHideText && (
              <span
                className="text-xs font-medium mb-2"
                style={{ ...truncateStyle, color: "#374151" }}
              >
                {node.text || "Table"}
              </span>
            )}
            {!isTinyNode &&
              [1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex gap-2 py-1.5 border-b border-slate-100"
                >
                  <div className="h-2 flex-[2] bg-slate-100 rounded" />
                  <div className="h-2 flex-1 bg-slate-50 rounded" />
                  <div className="h-2 flex-1 bg-slate-100 rounded" />
                </div>
              ))}
          </div>
        );

      case "card": {
        // Detect horizontal action-card layout (wide card or explicit row direction)
        const isRowCard =
          meta.layoutDirection === "row" ||
          (node.width > node.height * 1.6 && node.children.length === 0);

        if (shouldHideText) {
          return (
            <div className="w-full h-full flex items-center justify-center">
              {iconName ? renderIcon("w-4 h-4 text-slate-300") : null}
            </div>
          );
        }

        // Horizontal action-card style (like Script.io action tiles)
        if (isRowCard) {
          const badgeBg = node.styles?.backgroundColor
            ? undefined // bg already on outer div
            : "#eef2ff";
          const badgeFg = node.styles?.color || "#6366f1";
          return (
            <div className="w-full h-full flex flex-row items-center gap-3 px-4 overflow-hidden min-w-0">
              {Icon && (
                <div
                  className="shrink-0 rounded-xl flex items-center justify-center"
                  style={{
                    width: Math.min(44, node.height - 16),
                    height: Math.min(44, node.height - 16),
                    background: badgeBg,
                    color: badgeFg,
                  }}
                >
                  {renderIcon("w-5 h-5")}
                </div>
              )}
              <span
                className="flex-1 text-sm font-medium min-w-0"
                style={{ ...truncateStyle, color: node.styles?.color || "#1e293b" }}
              >
                {node.text || "Action"}
              </span>
              {!isCompactNode && (
                <span className="shrink-0 text-slate-400 text-base font-light">+</span>
              )}
            </div>
          );
        }

        // Vertical card (stat-card, project-card, etc.)
        return (
          <div
            className="w-full h-full flex flex-col overflow-hidden min-w-0"
            style={contentSpacingStyle}
          >
            {Icon && (
              <div className="mb-2 w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500">
                {renderIcon("w-4 h-4")}
              </div>
            )}
            {textLines.length > 1 ? (
              <>
                <span
                  className="text-[10px]"
                  style={{ ...truncateStyle, color: "#94a3b8" }}
                >
                  {textLines[0]}
                </span>
                <span
                  className="text-lg font-bold"
                  style={{ ...truncateStyle, color: node.styles?.color || "#1e293b" }}
                >
                  {textLines[1]}
                </span>
              </>
            ) : (
              <span
                className="text-xs"
                style={{ ...truncateStyle, color: "#64748b" }}
              >
                {node.text || "Card"}
              </span>
            )}
          </div>
        );
      }

      case "button": {
        const btnFg = getButtonFgColor(surface, emphasis);
        // Nav items (sidebar links) render left-aligned with leading icon
        const isNavItem = ["nav-item", "navbar-link", "nav-group"].includes(
          (meta.semanticType as string) || "",
        );

        if (iconOnly) {
          return (
            <div className="flex items-center justify-center w-full h-full">
              {renderIcon("w-3.5 h-3.5")}
            </div>
          );
        }
        if (shouldHideText) {
          return (
            <div className="w-full h-full flex items-center px-3">
              {iconName ? (
                <span style={{ color: btnFg }}>{renderIcon("w-3.5 h-3.5")}</span>
              ) : null}
            </div>
          );
        }
        if (isNavItem) {
          return (
            <div
              className="flex items-center gap-2.5 w-full h-full px-3 min-w-0 overflow-hidden"
            >
              {Icon ? (
                <span className="shrink-0" style={{ color: btnFg }}>
                  {renderIcon("w-3.5 h-3.5")}
                </span>
              ) : null}
              <span
                className="text-xs font-medium min-w-0"
                style={{ ...truncateStyle, color: btnFg }}
              >
                {node.text || "Nav Item"}
              </span>
            </div>
          );
        }
        return (
          <div
            className="flex items-center justify-center w-full h-full min-w-0 overflow-hidden"
            style={contentSpacingStyle}
          >
            {showLeadingIcon
              ? <span style={{ color: btnFg }}>{renderIcon("w-3.5 h-3.5")}</span>
              : null}
            <span
              className="text-xs font-medium"
              style={{ ...truncateStyle, color: btnFg }}
            >
              {node.text || "Button"}
            </span>
            {showTrailingIcon
              ? <span style={{ color: btnFg }}>{renderIcon("w-3.5 h-3.5")}</span>
              : null}
          </div>
        );
      }

      case "input": {
        const isSearch = (meta.semanticType as string) === "search-input" || iconName === "search";
        if (shouldHideText) {
          return (
            <div className="w-full h-full flex items-center gap-2 px-3">
              {renderIcon("w-3.5 h-3.5 text-slate-400")}
            </div>
          );
        }
        return (
          <div
            className="flex items-center gap-2 w-full h-full min-w-0 overflow-hidden px-3"
          >
            {renderIcon("w-3.5 h-3.5 text-slate-400")}
            <span
              className="flex-1 text-xs min-w-0"
              style={{ ...truncateStyle, color: "#94a3b8" }}
            >
              {node.text || (isSearch ? "Search" : "Input...")}
            </span>
            {isSearch && !isCompactNode && (
              <span className="shrink-0 text-[10px] text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                ⌘K
              </span>
            )}
          </div>
        );
      }

      case "sidebar":
        return (
          <div
            className="w-full h-full flex flex-col overflow-hidden"
            style={contentSpacingStyle}
          >
            {!shouldHideText && (
              <div className="flex items-center gap-2 mb-2 px-1 min-w-0">
                {Icon && renderIcon("w-3.5 h-3.5 text-slate-400")}
                <span
                  className="text-[10px] font-medium min-w-0"
                  style={{ ...truncateStyle, color: "#64748b" }}
                >
                  {node.text || "Sidebar"}
                </span>
              </div>
            )}
            {node.children.length === 0 && !isTinyNode && (
              <div className="flex flex-col gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-3 bg-slate-100 rounded mx-1" />
                ))}
              </div>
            )}
          </div>
        );

      case "navbar":
        return (
          <div
            className="flex items-center w-full h-full overflow-hidden min-w-0"
            style={contentSpacingStyle}
          >
            {Icon && renderIcon("w-3.5 h-3.5 text-slate-400")}
            {!shouldHideText && (
              <span
                className="text-[10px] min-w-0"
                style={{ ...truncateStyle, color: "#94a3b8" }}
              >
                {node.text || "Navigation"}
              </span>
            )}
            <div className="flex-1" />
            {!isCompactNode && <div className="h-3 w-16 bg-slate-100 rounded" />}
          </div>
        );

      case "image-placeholder":
        return (
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <div
              className={`flex items-center justify-center ${
                semanticType === "avatar" ? "rounded-full bg-slate-200" : "rounded-lg bg-slate-200"
              }`}
              style={{
                width: Math.max(12, Math.min(node.width - 8, Math.max(20, node.width * 0.6))),
                height: Math.max(12, Math.min(node.height - 8, Math.max(20, node.height * 0.6))),
              }}
            >
              {renderIcon("w-4 h-4 text-slate-400")}
            </div>
          </div>
        );

      default:
        if (shouldHideText) {
          return <div className="w-full h-full" />;
        }
        return (
          <div
            className="flex items-center justify-center w-full h-full min-w-0 overflow-hidden"
            style={contentSpacingStyle}
          >
            <span
              className={hasCustomFont ? "" : "text-xs"}
              style={
                hasCustomFont
                  ? {
                      ...truncateStyle,
                      fontSize: "inherit",
                      fontFamily: "inherit",
                      fontWeight: "inherit",
                      color: node.styles?.color || "#64748b",
                    }
                  : { ...truncateStyle, color: node.styles?.color || "#64748b" }
              }
            >
              {node.text || node.type}
            </span>
          </div>
        );
    }
  };

  return (
    <div
      ref={blockRef}
      className={`wireframe-block absolute select-none overflow-hidden ${
        isSelected ? "node-selected" : ""
      } ${!visible ? "opacity-40 pointer-events-none" : ""}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        background:
          hideChrome && !isSelected
            ? "transparent"
            : node.styles?.backgroundColor || node.styles?.background || visualSurface.background,
        borderWidth: parseNumericStyle(node.styles?.borderWidth) ?? 1,
        borderStyle:
          ((node.styles?.borderStyle as "solid" | "dashed" | undefined) ??
            (kind === "frame" || kind === "section" ? "dashed" : "solid")),
        borderColor:
          isSelected
            ? "var(--accent)"
            : hideChrome
              ? "transparent"
              : node.styles?.borderColor || visualSurface.borderColor,
        borderRadius: borderRadius ?? (node.type === "sidebar" ? "0" : "8px"),
        cursor:
          activeTool === "hand"
            ? "grab"
            : isEditing
              ? "text"
              : activeTool === "move"
                ? "move"
                : "default",
        zIndex: isSelected ? 50 : depth + 1,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "top left",
        color: node.styles?.color || undefined,
        fontSize: node.styles?.fontSize,
        fontFamily: node.styles?.fontFamily,
        fontWeight: node.styles?.fontWeight
          ? Number(node.styles.fontWeight)
          : undefined,
        opacity: opacity != null ? Math.max(0.1, Math.min(1, opacity)) : undefined,
        // Light drop-shadow for cards/containers
        boxShadow:
          !isSelected && (node.type === "card" || node.type === "container") && !hideChrome
            ? "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"
            : undefined,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => {
        e.stopPropagation();
        onSelectInPage?.();
        selectNode(node.id);
      }}
    >
      {showTypeBadge && (
        <div
          className="absolute top-1 right-1 text-[8px] px-1 py-0.5 rounded border pointer-events-none truncate"
          style={{
            maxWidth: "calc(100% - 8px)",
            background: "rgba(255,255,255,0.92)",
            borderColor: "#e2e8f0",
            color: "#64748b",
          }}
        >
          {style.label} {node.type}
        </div>
      )}

      {renderContent()}

      {isSelected && !isEditing && activeTool === "move" && (
        <>
          <div
            className="resize-handle resize-handle-se"
            onMouseDown={(e) => handleResizeStart(e, "se")}
          />
          <div
            className="resize-handle resize-handle-sw"
            onMouseDown={(e) => handleResizeStart(e, "sw")}
          />
          <div
            className="resize-handle resize-handle-ne"
            onMouseDown={(e) => handleResizeStart(e, "ne")}
          />
          <div
            className="resize-handle resize-handle-nw"
            onMouseDown={(e) => handleResizeStart(e, "nw")}
          />
          <div
            className="resize-handle resize-handle-e"
            onMouseDown={(e) => handleResizeStart(e, "e")}
          />
          <div
            className="resize-handle resize-handle-w"
            onMouseDown={(e) => handleResizeStart(e, "w")}
          />
          <div
            className="resize-handle resize-handle-n"
            onMouseDown={(e) => handleResizeStart(e, "n")}
          />
          <div
            className="resize-handle resize-handle-s"
            onMouseDown={(e) => handleResizeStart(e, "s")}
          />
        </>
      )}
    </div>
  );
}
