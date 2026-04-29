'use client';

import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/store/editorStore';
import {
  Sparkles,
  Trash2,
  Copy,
  Code,
  ArrowLeft,
  Undo2,
  Redo2,
  Clipboard,
  ClipboardPaste,
  MoreHorizontal,
  Users,
  LayoutDashboard,
} from 'lucide-react';

export default function Toolbar() {
  const router = useRouter();
  const {
    projectName,
    selectedNodeId,
    clipboard,
    deleteNode,
    duplicateNode,
    setExportOpen,
    undo,
    redo,
    copyNode,
    pasteNode,
    selectedElementId,
    copyCodeElement,
    pasteCodeElement,
    duplicateCodeElement,
    deleteCodeElement,
  } = useEditorStore();

  // Subscribe directly so buttons re-render when history changes
  const historyIndex = useEditorStore(s => s.historyIndex);
  const historyLength = useEditorStore(s => s.history.length);

  return (
    <div className="h-12 bg-white border-b border-[var(--border)] flex items-center px-3 gap-2 shrink-0">
      {/* Back / Logo */}
      <button
        onClick={() => router.push('/')}
        className="p-1.5 rounded-md hover:bg-slate-100 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        title="Back to home"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2 mr-1">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-semibold leading-none">{projectName || 'Unclash'}</span>
        </div>
      </div>

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5 ml-1">
        <button
          onClick={undo}
          disabled={historyIndex <= 0}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={redo}
          disabled={historyIndex >= historyLength - 1}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Center: Wireframe | Code view mode */}
      <div className="flex-1 flex justify-center items-center">
        <div className="flex items-center bg-[var(--bg-elevated)] rounded-lg p-0.5 border border-[var(--border)]">
          <button
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-slate-100 text-slate-800 shadow-sm"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Wireframe
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Code className="w-3.5 h-3.5" />
            Code
          </button>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Copy / Paste */}
        <button
          onClick={() => {
            if (selectedNodeId) copyNode(selectedNodeId);
            else if (selectedElementId) copyCodeElement(selectedElementId);
          }}
          disabled={!selectedNodeId && !selectedElementId}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          title="Copy (Ctrl+C)"
        >
          <Clipboard className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            if (selectedElementId) pasteCodeElement();
            else pasteNode();
          }}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          title="Paste (Ctrl+V)"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-[var(--border)] mx-0.5" />

        {/* Duplicate / Delete */}
        <button
          onClick={() => {
            if (selectedNodeId) duplicateNode(selectedNodeId);
            else if (selectedElementId) duplicateCodeElement(selectedElementId);
          }}
          disabled={!selectedNodeId && !selectedElementId}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          title="Duplicate (Ctrl+D)"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            if (selectedNodeId) deleteNode(selectedNodeId);
            else if (selectedElementId) deleteCodeElement(selectedElementId);
          }}
          disabled={!selectedNodeId && !selectedElementId}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          title="Delete (Del)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-[var(--border)] mx-0.5" />

        {/* Collaborators placeholder */}
        <button
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)] transition-colors"
          title="Collaborators"
        >
          <Users className="w-3.5 h-3.5" />
        </button>

        {/* More */}
        <button
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)] transition-colors"
          title="More options"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-[var(--border)] mx-0.5" />

        {/* Export / Publish */}
        <button
          onClick={() => setExportOpen(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
        >
          Export
        </button>
      </div>
    </div>
  );
}
