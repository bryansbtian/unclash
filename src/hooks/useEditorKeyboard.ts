'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';

/**
 * Global keyboard shortcuts for the editor.
 * - Ctrl+Z  → Undo
 * - Ctrl+Y / Ctrl+Shift+Z → Redo
 * - Ctrl+C  → Copy selected node
 * - Ctrl+V  → Paste copied node
 * - Delete / Backspace → Delete selected node
 * - Ctrl+D  → Duplicate selected node
 */
export function useEditorKeyboard() {
  const {
    selectedNodeId,
    undo,
    redo,
    copyNode,
    pasteNode,
    deleteNode,
    duplicateNode,
    setActiveTool,
    getSelectedNode,
    updateNode,
    selectedElementId,
    copyCodeElement,
    pasteCodeElement,
    duplicateCodeElement,
    deleteCodeElement,
  } = useEditorStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Font size shortcuts work everywhere (even in text inputs)
      if (ctrl && e.shiftKey && (e.key === '>' || e.key === '.')) {
        if (selectedNodeId) {
          e.preventDefault();
          const node = getSelectedNode();
          if (node) {
            const current = parseInt(node.styles?.fontSize || '14', 10);
            const next = Math.min(200, current + 2);
            updateNode(selectedNodeId, {
              styles: { ...node.styles, fontSize: `${next}px` },
            });
          }
        }
        return;
      }
      if (ctrl && e.shiftKey && (e.key === '<' || e.key === ',')) {
        if (selectedNodeId) {
          e.preventDefault();
          const node = getSelectedNode();
          if (node) {
            const current = parseInt(node.styles?.fontSize || '14', 10);
            const next = Math.max(6, current - 2);
            updateNode(selectedNodeId, {
              styles: { ...node.styles, fontSize: `${next}px` },
            });
          }
        }
        return;
      }

      // Ignore remaining shortcuts when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Tool shortcuts (Figma-style)
      // v: move (default)
      if (!ctrl && !e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        setActiveTool("move");
        return;
      }
      // h: hand (pan canvas)
      if (!ctrl && !e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setActiveTool("hand");
        return;
      }
      // shift+s: section
      if (!ctrl && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setActiveTool("section");
        return;
      }
      // w: webpage
      if (!ctrl && !e.shiftKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        setActiveTool("webpage");
        return;
      }
      // f: frame
      if (!ctrl && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setActiveTool("frame");
        return;
      }
      // r: rectangle
      if (!ctrl && !e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        setActiveTool("rectangle");
        return;
      }
      // l: line
      if (!ctrl && !e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setActiveTool("line");
        return;
      }
      // shift+l: arrow
      if (!ctrl && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setActiveTool("arrow");
        return;
      }
      // o: ellipse
      if (!ctrl && !e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setActiveTool("ellipse");
        return;
      }
      // t: text
      if (!ctrl && !e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setActiveTool("text");
        return;
      }
      // c: comment
      if (!ctrl && !e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setActiveTool("comment");
        return;
      }
      // ctrl+shift+k: upload image/video
      if (ctrl && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setActiveTool("upload");
        return;
      }

      // Ctrl+Z → Undo
      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z → Redo
      if ((ctrl && e.key === 'y') || (ctrl && e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+C → Copy
      if (ctrl && e.key === 'c') {
        if (selectedNodeId) {
          e.preventDefault();
          copyNode(selectedNodeId);
        } else if (selectedElementId) {
          e.preventDefault();
          copyCodeElement(selectedElementId);
        }
        return;
      }

      // Ctrl+V → Paste
      if (ctrl && e.key === 'v') {
        e.preventDefault();
        if (selectedElementId) {
          pasteCodeElement();
        } else {
          pasteNode();
        }
        return;
      }

      // Ctrl+D → Duplicate
      if (ctrl && e.key === 'd') {
        if (selectedNodeId) {
          e.preventDefault();
          duplicateNode(selectedNodeId);
        } else if (selectedElementId) {
          e.preventDefault();
          duplicateCodeElement(selectedElementId);
        }
        return;
      }

      // Delete / Backspace → Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          e.preventDefault();
          deleteNode(selectedNodeId);
        } else if (selectedElementId) {
          e.preventDefault();
          deleteCodeElement(selectedElementId);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedNodeId, selectedElementId, undo, redo, copyNode, pasteNode, deleteNode, duplicateNode,
    copyCodeElement, pasteCodeElement, deleteCodeElement, duplicateCodeElement,
    setActiveTool, getSelectedNode, updateNode
  ]);
}
