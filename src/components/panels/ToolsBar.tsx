'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import {
  Hand,
  MousePointer2,
  PanelsTopLeft,
  Globe,
  Frame,
  Square,
  Minus,
  ArrowRight,
  Type,
  Circle,
  MessageSquare,
  Image,
  Undo2,
  Redo2,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';

export type ToolType =
  | 'move'
  | 'hand'
  | 'section'
  | 'webpage'
  | 'frame'
  | 'rectangle'
  | 'line'
  | 'arrow'
  | 'ellipse'
  | 'text'
  | 'comment'
  | 'upload';

interface ToolDef {
  id: ToolType;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
}

interface ToolGroup {
  tools: ToolDef[];
  defaultId: ToolType;
}

const ICON = 'w-4 h-4';

const TOOL_GROUPS: ToolGroup[] = [
  {
    defaultId: 'move',
    tools: [
      { id: 'move', icon: <MousePointer2 className={ICON} />, label: 'Move', shortcut: 'V' },
      { id: 'hand', icon: <Hand className={ICON} />, label: 'Hand tool', shortcut: 'H' },
    ],
  },
  {
    defaultId: 'section',
    tools: [
      { id: 'section', icon: <PanelsTopLeft className={ICON} />, label: 'Section', shortcut: 'Shift+S' },
      { id: 'webpage', icon: <Globe className={ICON} />, label: 'Webpage', shortcut: 'W' },
      { id: 'frame', icon: <Frame className={ICON} />, label: 'Frame', shortcut: 'F' },
    ],
  },
  {
    defaultId: 'rectangle',
    tools: [
      { id: 'rectangle', icon: <Square className={ICON} />, label: 'Rectangle', shortcut: 'R' },
      { id: 'line', icon: <Minus className={ICON} />, label: 'Line', shortcut: 'L' },
      { id: 'arrow', icon: <ArrowRight className={ICON} />, label: 'Arrow', shortcut: 'Shift+L' },
      { id: 'ellipse', icon: <Circle className={ICON} />, label: 'Ellipse', shortcut: 'O' },
    ],
  },
];

const STANDALONE_TOOLS: ToolDef[] = [
  { id: 'upload', icon: <Image className={ICON} />, label: 'Image / Video', shortcut: 'Ctrl+Shift+K' },
  { id: 'text', icon: <Type className={ICON} />, label: 'Text', shortcut: 'T' },
  { id: 'comment', icon: <MessageSquare className={ICON} />, label: 'Comment', shortcut: 'C' },
];

// ── Dropdown for a tool group ──────────────────────────────

function ToolGroupButton({ group }: { group: ToolGroup }) {
  const { activeTool, setActiveTool } = useEditorStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeMember = group.tools.find((t) => t.id === activeTool);
  const visibleTool = activeMember ?? group.tools.find((t) => t.id === group.defaultId)!;
  const isGroupActive = !!activeMember;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleMainClick = useCallback(() => {
    setActiveTool(visibleTool.id);
    setOpen(false);
  }, [visibleTool.id, setActiveTool]);

  const handleChevronClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((o) => !o);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center">
        <button
          onClick={handleMainClick}
          className={`flex items-center p-2.5 rounded-l-lg transition-colors ${
            isGroupActive
              ? 'bg-indigo-50 text-indigo-600'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
          title={`${visibleTool.label} (${visibleTool.shortcut})`}
        >
          {visibleTool.icon}
        </button>

        <button
          onClick={handleChevronClick}
          className={`flex items-center pr-1.5 py-2.5 rounded-r-lg transition-colors ${
            isGroupActive
              ? 'bg-indigo-50 text-indigo-400 hover:text-indigo-600'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </div>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 min-w-[200px] py-1.5 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden z-50">
          {group.tools.map((tool) => {
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => { setActiveTool(tool.id); setOpen(false); }}
                className={`flex items-center w-full gap-3 px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'text-slate-900'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="w-4 shrink-0">
                  {isActive && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </span>
                {tool.icon}
                <span className="flex-1 text-[13px]">{tool.label}</span>
                <span className="text-[11px] text-slate-400 tabular-nums">{tool.shortcut}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main toolbar ───────────────────────────────────────────

export default function ToolsBar() {
  const {
    pages,
    currentPageId,
    activeTool,
    setActiveTool,
    updatePage,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useEditorStore();

  // Subscribe directly so buttons re-render when history changes
  useEditorStore(s => s.historyIndex);
  useEditorStore(s => s.history.length);

  const uploadInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-1 px-2.5 py-1.5 bg-white rounded-2xl border border-slate-200 shadow-lg">
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp,video/mp4,video/webm,video/ogg,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          const page = pages.find((p) => p.id === currentPageId);
          if (!page) return;

          const allowed = files.filter(
            (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
          );
          if (!allowed.length) return;

          const newNodes = allowed.map((file, i) => ({
            id: uuid(),
            type: 'image-placeholder' as const,
            x: 48 + i * 20,
            y: 48 + i * 20,
            width: 320,
            height: 200,
            text: file.name,
            children: [] as import('@/types/schema').WireframeNode[],
            metadata: {
              kind: file.type.startsWith('video/') ? 'video' : 'image',
            },
          }));

          updatePage(page.id, { children: [...page.children, ...newNodes] });
          setActiveTool('move');
          e.currentTarget.value = '';
        }}
      />

      {/* Tool groups with dropdowns */}
      {TOOL_GROUPS.map((group, i) => (
        <ToolGroupButton key={i} group={group} />
      ))}

      <div className="w-px h-5 bg-slate-200 mx-1.5" />

      {/* Standalone tools */}
      {STANDALONE_TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => {
              if (tool.id === 'upload') uploadInputRef.current?.click();
              setActiveTool(tool.id);
            }}
            className={`flex items-center p-2.5 rounded-lg transition-colors ${
              isActive
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
            title={`${tool.label} (${tool.shortcut})`}
          >
            {tool.icon}
          </button>
        );
      })}

      <div className="w-px h-5 bg-slate-200 mx-1.5" />

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={!canUndo()}
        className="p-2.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        title="Undo"
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo()}
        className="p-2.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        title="Redo"
      >
        <Redo2 className="w-4 h-4" />
      </button>
    </div>
  );
}
