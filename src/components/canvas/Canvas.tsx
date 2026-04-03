'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useEditorStore } from '@/store/editorStore';
import { Page, WireframeNode } from '@/types/schema';
import WireframeBlock from './WireframeBlock';
import CodeFrame from './CodeFrame';
import { Play, Plus } from 'lucide-react';

/** Flatten a node tree into a depth-ordered array for rendering. */
function flattenForRender(nodes: WireframeNode[], depth = 0): Array<{ node: WireframeNode; depth: number }> {
  const result: Array<{ node: WireframeNode; depth: number }> = [];
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.children.length > 0) {
      result.push(...flattenForRender(node.children, depth + 1));
    }
  }
  return result;
}

const GRID_SIZE = 1;
const ZOOM_STEP = 0.006;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 3;
const PAGE_GAP = 80;
const CANVAS_PADDING = 100;
const AUTO_PAGE_START_X = 400;
const AUTO_PAGE_START_Y = 220;

type DrawTool =
  | 'section'
  | 'webpage'
  | 'frame'
  | 'rectangle'
  | 'line'
  | 'arrow'
  | 'ellipse'
  | 'text'
  | 'comment';

const CANVAS_LEVEL_TOOLS: ReadonlySet<string> = new Set([
  'webpage', 'section', 'frame',
]);

interface ArtboardDraft {
  kind: 'artboard';
  tool: DrawTool;
  pageId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface CanvasDraft {
  kind: 'canvas';
  tool: DrawTool;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

type DrawDraft = ArtboardDraft | CanvasDraft;

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function isDrawTool(value: string): value is DrawTool {
  return [
    'section', 'webpage', 'frame', 'rectangle',
    'line', 'arrow', 'ellipse', 'text', 'comment',
  ].includes(value);
}

function normalizeRectRaw(
  startX: number, startY: number, currentX: number, currentY: number,
  maxW = Infinity, maxH = Infinity,
) {
  const x1 = Math.max(0, Math.min(maxW, Math.min(startX, currentX)));
  const y1 = Math.max(0, Math.min(maxH, Math.min(startY, currentY)));
  const x2 = Math.max(0, Math.min(maxW, Math.max(startX, currentX)));
  const y2 = Math.max(0, Math.min(maxH, Math.max(startY, currentY)));
  return {
    x: snapToGrid(x1),
    y: snapToGrid(y1),
    width: snapToGrid(Math.max(2, x2 - x1)),
    height: snapToGrid(Math.max(2, y2 - y1)),
  };
}

function normalizeRect(draft: ArtboardDraft, page: Page) {
  return normalizeRectRaw(
    draft.startX, draft.startY, draft.currentX, draft.currentY,
    page.width, page.height,
  );
}

function draftToNode(draft: ArtboardDraft, page: Page): WireframeNode | null {
  const rect = normalizeRect(draft, page);
  const tool = draft.tool;

  if (tool === 'line') {
    return {
      id: uuid(), type: 'container',
      x: rect.x, y: rect.y + Math.max(0, rect.height / 2 - 1),
      width: Math.max(20, rect.width), height: 2,
      text: '', children: [], metadata: { kind: 'line' },
    };
  }
  if (tool === 'arrow') {
    return {
      id: uuid(), type: 'container',
      x: rect.x, y: rect.y + Math.max(0, rect.height / 2 - 1),
      width: Math.max(30, rect.width), height: 2,
      text: '', children: [], metadata: { kind: 'arrow' },
    };
  }
  if (tool === 'text') {
    return {
      id: uuid(), type: 'text',
      x: rect.x, y: rect.y,
      width: Math.max(120, rect.width), height: Math.max(24, rect.height),
      text: 'Text', children: [], metadata: { kind: 'text-box' },
    };
  }
  if (tool === 'comment') {
    return {
      id: uuid(), type: 'text',
      x: rect.x, y: rect.y,
      width: Math.max(140, rect.width), height: Math.max(48, rect.height),
      text: 'Comment', children: [], metadata: { kind: 'comment' },
    };
  }
  if (tool === 'ellipse') {
    return {
      id: uuid(), type: 'container',
      x: rect.x, y: rect.y,
      width: Math.max(20, rect.width), height: Math.max(20, rect.height),
      text: 'Ellipse', children: [], metadata: { kind: 'ellipse' },
    };
  }

  const kind = tool === 'section' ? 'section' : tool === 'frame' ? 'frame' : 'rectangle';
  return {
    id: uuid(), type: 'container',
    x: rect.x, y: rect.y,
    width: Math.max(20, rect.width), height: Math.max(20, rect.height),
    text: tool === 'section' ? 'Section' : tool === 'frame' ? 'Frame' : 'Rectangle',
    children: [], metadata: { kind },
  };
}

// Compute { x, y } for every page.  Pages with explicit canvasX/canvasY keep
// them; pages without get auto-laid-out in a horizontal row.
function computePagePositions(pages: Page[]) {
  let autoX = AUTO_PAGE_START_X;
  return pages.map((page) => {
    if (page.canvasX != null && page.canvasY != null) {
      return { page, x: page.canvasX, y: page.canvasY };
    }
    const x = autoX;
    autoX += page.width + PAGE_GAP;
    return { page, x, y: AUTO_PAGE_START_Y };
  });
}

export default function Canvas() {
  const store = useEditorStore();
  const {
    pages, currentPageId, activeTool,
    setCurrentPage, setActiveTool, addPage, addPageAfter,
    updatePage, selectNode, alignmentGuides,
  } = store;

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasInnerRef = useRef<HTMLDivElement>(null);
  const didAutoCenter = useRef(false);
  const panState = useRef<{
    startX: number; startY: number;
    startScrollLeft: number; startScrollTop: number;
    active: boolean;
  } | null>(null);

  const [zoom, setZoom] = useState(0.7);
  const [isPanning, setIsPanning] = useState(false);
  const [drawDraft, setDrawDraft] = useState<DrawDraft | null>(null);
  const drawDraftRef = useRef<DrawDraft | null>(null);
  const zoomRef = useRef(zoom);

  useEffect(() => { drawDraftRef.current = drawDraft; }, [drawDraft]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Auto-center viewport on first render
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || didAutoCenter.current) return;
    requestAnimationFrame(() => {
      const next = scrollRef.current;
      if (!next) return;
      next.scrollLeft = Math.max(0, (next.scrollWidth - next.clientWidth) / 2);
      next.scrollTop = Math.max(0, (next.scrollHeight - next.clientHeight) / 2);
      didAutoCenter.current = true;
    });
  }, [pages.length]);

  // Canvas zoom (pinch / Ctrl+wheel)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      setZoom((z) => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100));
      });
    }
  }, []);

  // ── Hand tool panning ──
  const handlePanMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool !== 'hand') return;
    const target = e.target as HTMLElement;
    if (target.closest('input,button,textarea,select')) return;
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    panState.current = {
      startX: e.clientX, startY: e.clientY,
      startScrollLeft: el.scrollLeft, startScrollTop: el.scrollTop,
      active: true,
    };
    setIsPanning(true);
  }, [activeTool]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const st = panState.current;
      const el = scrollRef.current;
      if (!st?.active || !el) return;
      el.scrollLeft = st.startScrollLeft - (e.clientX - st.startX);
      el.scrollTop = st.startScrollTop - (e.clientY - st.startY);
    };
    const onUp = () => {
      if (panState.current) panState.current.active = false;
      setIsPanning(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Get coordinates in unscaled canvas-inner space
  const getCanvasPoint = useCallback((e: MouseEvent | React.MouseEvent) => {
    const inner = canvasInnerRef.current;
    if (!inner) return { x: 0, y: 0 };
    const rect = inner.getBoundingClientRect();
    return {
      x: snapToGrid((e.clientX - rect.left) / zoomRef.current),
      y: snapToGrid((e.clientY - rect.top) / zoomRef.current),
    };
  }, []);

  // ── Draw on artboard (inside a page) ──
  const handleArtboardMouseDown = useCallback((e: React.MouseEvent, page: Page) => {
    if (activeTool === 'hand' || activeTool === 'move' || activeTool === 'upload') return;
    if (!isDrawTool(activeTool)) return;

    const target = e.target as HTMLElement;
    if (target.closest('.wireframe-block')) return;
    const artboard = target.closest('[data-artboard-id]') as HTMLElement | null;
    if (!artboard) return;

    e.preventDefault();
    e.stopPropagation();
    setCurrentPage(page.id);

    const rect = artboard.getBoundingClientRect();
    const x = snapToGrid((e.clientX - rect.left) / zoomRef.current);
    const y = snapToGrid((e.clientY - rect.top) / zoomRef.current);

    const draft: ArtboardDraft = {
      kind: 'artboard', tool: activeTool, pageId: page.id,
      startX: x, startY: y, currentX: x, currentY: y,
    };
    setDrawDraft(draft);
    drawDraftRef.current = draft;

    const onMove = (ev: MouseEvent) => {
      const d = drawDraftRef.current;
      if (!d || d.kind !== 'artboard') return;
      const r = artboard.getBoundingClientRect();
      const mx = snapToGrid((ev.clientX - r.left) / zoomRef.current);
      const my = snapToGrid((ev.clientY - r.top) / zoomRef.current);
      const updated: ArtboardDraft = { ...d, currentX: mx, currentY: my };
      drawDraftRef.current = updated;
      setDrawDraft(updated);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      const d = drawDraftRef.current;
      if (!d || d.kind !== 'artboard') { setDrawDraft(null); drawDraftRef.current = null; return; }

      const currentPages = useEditorStore.getState().pages;
      const pg = currentPages.find((p) => p.id === d.pageId);
      if (!pg) { setDrawDraft(null); drawDraftRef.current = null; return; }

      const nr = normalizeRect(d, pg);
      if (nr.width < 4 && nr.height < 4) { setDrawDraft(null); drawDraftRef.current = null; return; }

      if (d.tool === 'webpage') {
        const positions = computePagePositions(currentPages);
        const last = positions[positions.length - 1];
        const newX = last ? last.x + last.page.width + PAGE_GAP : 0;
        addPage({
          id: `page-${uuid()}`, name: `/page-${currentPages.length + 1}`,
          width: Math.max(360, nr.width), height: Math.max(240, nr.height),
          canvasX: newX, canvasY: last?.y ?? 0,
          children: [],
        });
      } else {
        const node = draftToNode(d, pg);
        if (node) {
          updatePage(pg.id, { children: [...pg.children, node] });
          selectNode(node.id);
        }
      }

      setDrawDraft(null);
      drawDraftRef.current = null;
      setActiveTool('move');
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [activeTool, setCurrentPage, addPage, updatePage, selectNode, setActiveTool]);

  // ── Draw on canvas background (not inside any page) ──
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'hand' || activeTool === 'move' || activeTool === 'upload') return;
    if (!isDrawTool(activeTool)) return;

    const target = e.target as HTMLElement;
    if (target.closest('[data-artboard-id]')) return;
    if (target.closest('.wireframe-block')) return;
    if (target.closest('input,button,textarea,select')) return;
    // Also skip page-header area
    if (target.closest('[data-page-header]')) return;

    // Non-canvas-level shapes on background → add to current page
    if (!CANVAS_LEVEL_TOOLS.has(activeTool)) {
      const currentPages = useEditorStore.getState().pages;
      const cid = useEditorStore.getState().currentPageId;
      const curPage = currentPages.find((p) => p.id === cid) || currentPages[0];
      if (!curPage) return;

      e.preventDefault();
      e.stopPropagation();

      const pt = getCanvasPoint(e);
      const draft: CanvasDraft = {
        kind: 'canvas', tool: activeTool,
        startX: pt.x, startY: pt.y, currentX: pt.x, currentY: pt.y,
      };
      setDrawDraft(draft);
      drawDraftRef.current = draft;

      const onMove = (ev: MouseEvent) => {
        const d = drawDraftRef.current;
        if (!d || d.kind !== 'canvas') return;
        const cp = getCanvasPoint(ev);
        const updated: CanvasDraft = { ...d, currentX: cp.x, currentY: cp.y };
        drawDraftRef.current = updated;
        setDrawDraft(updated);
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);

        const d = drawDraftRef.current;
        if (!d || d.kind !== 'canvas') { setDrawDraft(null); drawDraftRef.current = null; return; }

        const latestPages = useEditorStore.getState().pages;
        const latestCid = useEditorStore.getState().currentPageId;
        const pg = latestPages.find((p) => p.id === latestCid) || latestPages[0];
        if (!pg) { setDrawDraft(null); drawDraftRef.current = null; return; }

        const nr = normalizeRectRaw(d.startX, d.startY, d.currentX, d.currentY);
        if (nr.width < 4 && nr.height < 4) { setDrawDraft(null); drawDraftRef.current = null; return; }

        const fakeDraft: ArtboardDraft = {
          kind: 'artboard', tool: d.tool, pageId: pg.id,
          startX: 10, startY: 10,
          currentX: 10 + nr.width, currentY: 10 + nr.height,
        };
        const node = draftToNode(fakeDraft, pg);
        if (node) {
          updatePage(pg.id, { children: [...pg.children, node] });
          selectNode(node.id);
        }

        setDrawDraft(null);
        drawDraftRef.current = null;
        setActiveTool('move');
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }

    // Canvas-level tools: webpage, section, frame → draw to position a new page
    e.preventDefault();
    e.stopPropagation();

    const pt = getCanvasPoint(e);
    const draft: CanvasDraft = {
      kind: 'canvas', tool: activeTool,
      startX: pt.x, startY: pt.y, currentX: pt.x, currentY: pt.y,
    };
    setDrawDraft(draft);
    drawDraftRef.current = draft;

    const onMove = (ev: MouseEvent) => {
      const d = drawDraftRef.current;
      if (!d || d.kind !== 'canvas') return;
      const cp = getCanvasPoint(ev);
      const updated: CanvasDraft = { ...d, currentX: cp.x, currentY: cp.y };
      drawDraftRef.current = updated;
      setDrawDraft(updated);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      const d = drawDraftRef.current;
      if (!d || d.kind !== 'canvas') { setDrawDraft(null); drawDraftRef.current = null; return; }

      const nr = normalizeRectRaw(d.startX, d.startY, d.currentX, d.currentY);
      if (nr.width < 4 && nr.height < 4) { setDrawDraft(null); drawDraftRef.current = null; return; }

      const currentPages = useEditorStore.getState().pages;
      const w = Math.max(360, nr.width);
      const h = Math.max(240, nr.height);

      const toolLabel =
        d.tool === 'section' ? 'Section'
        : d.tool === 'frame' ? 'Frame'
        : `Page ${currentPages.length + 1}`;

      const pageName =
        d.tool === 'webpage' ? `/page-${currentPages.length + 1}` : toolLabel;

      // Place the new page exactly where the user drew it
      addPage({
        id: `page-${uuid()}`,
        name: pageName,
        width: w,
        height: h,
        canvasX: nr.x,
        canvasY: nr.y,
        children: [],
      });

      setDrawDraft(null);
      drawDraftRef.current = null;
      setActiveTool('move');
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [activeTool, getCanvasPoint, addPage, updatePage, selectNode, setActiveTool]);

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) selectNode(null);
  }, [selectNode]);

  if (!pages.length) return null;

  // Compute all page positions (explicit or auto-layout)
  const positions = computePagePositions(pages);

  // Canvas bounds from all page positions
  const maxRight = Math.max(...positions.map((p) => p.x + p.page.width));
  const maxBottom = Math.max(...positions.map((p) => p.y + p.page.height));
  const paddedWidth = maxRight + 400;
  const paddedHeight = maxBottom + 400;

  // Canvas-level draft preview
  const canvasDraftRect = drawDraft?.kind === 'canvas'
    ? normalizeRectRaw(drawDraft.startX, drawDraft.startY, drawDraft.currentX, drawDraft.currentY)
    : null;

  return (
    <div className="relative w-full h-full">
      <div
        ref={scrollRef}
        className={`w-full h-full overflow-auto ${
          activeTool === 'hand' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab')
          : isDrawTool(activeTool) ? 'cursor-crosshair'
          : ''
        }`}
        onWheel={handleWheel}
        onMouseDown={handlePanMouseDown}
      >
        <div
          className="relative origin-top-left"
          style={{ width: paddedWidth * zoom, height: paddedHeight * zoom, minWidth: '100%', minHeight: '100%' }}
          onClick={handleBackgroundClick}
          onMouseDown={handleCanvasMouseDown}
        >
          <div
            ref={canvasInnerRef}
            className="relative"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', padding: CANVAS_PADDING }}
          >
            {positions.map(({ page, x, y }) => {
              const isCurrent = currentPageId === page.id;
              const displayName = page.name || page.id;

              return (
                <div key={page.id} className="absolute" style={{ left: x, top: y }}>
                  {/* Page header */}
                  <div
                    data-page-header="true"
                    className="flex items-center justify-between px-3 py-2 mb-2 rounded-t-md bg-(--bg-elevated) border border-b-0 border-(--border) min-w-[200px]"
                    style={{ width: page.width }}
                  >
                    <button className="p-1 rounded text-(--text-muted) hover:bg-slate-100 hover:text-(--text-primary) transition-colors" title="Preview">
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => updatePage(page.id, { name: e.target.value })}
                      onClick={(e) => { e.stopPropagation(); setCurrentPage(page.id); }}
                      className="flex-1 mx-2 bg-transparent text-center text-[11px] font-medium text-(--text-primary) outline-none focus:ring-0 border-none min-w-0"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); addPageAfter(page.id); }}
                      className="p-1 rounded text-(--text-muted) hover:bg-slate-100 hover:text-(--text-primary) transition-colors"
                      title="Add page"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Artboard */}
                  <div
                    data-artboard-id={page.id}
                    className={`relative rounded-sm shadow-2xl ${
                      isCurrent ? 'ring-2 ring-[#589df6] ring-offset-2 ring-offset-(--bg-primary)' : ''
                    } ${activeTool === 'hand' ? 'cursor-grab' : isDrawTool(activeTool) ? 'cursor-crosshair' : 'cursor-default'}`}
                    style={{ width: page.width, height: page.height, background: '#ffffff', boxShadow: '0 8px 60px rgba(0,0,0,0.25), 0 2px 12px rgba(0,0,0,0.12)' }}
                    onMouseDown={(e) => handleArtboardMouseDown(e, page)}
                    onClick={(e) => { e.stopPropagation(); setCurrentPage(page.id); }}
                  >
                    {page.code ? (
                      <CodeFrame page={page} />
                    ) : (
                      flattenForRender(page.children).map(({ node: flatNode, depth }) => (
                        <WireframeBlock key={flatNode.id} node={flatNode} pageId={page.id} depth={depth} onSelectInPage={() => setCurrentPage(page.id)} />
                      ))
                    )}

                    {/* Artboard-level draw preview */}
                    {drawDraft?.kind === 'artboard' && drawDraft.pageId === page.id && (() => {
                      const nr = normalizeRect(drawDraft, page);
                      return (
                        <div
                          className="absolute pointer-events-none z-60"
                          style={{
                            left: nr.x, top: nr.y, width: nr.width, height: nr.height,
                            border: '2px dashed #818cf8',
                            background: 'rgba(99,102,241,0.08)',
                            borderRadius: drawDraft.tool === 'ellipse' ? '9999px' : '4px',
                          }}
                        />
                      );
                    })()}

                    {/* Alignment guides */}
                    {alignmentGuides.map((guide, i) =>
                      isCurrent ? (
                        <div
                          key={`guide-${i}`}
                          className="pointer-events-none"
                          style={{
                            position: 'absolute',
                            ...(guide.axis === 'x'
                              ? { left: guide.position, top: 0, width: 0, height: '100%', borderLeft: '1px solid #ef4444' }
                              : { top: guide.position, left: 0, height: 0, width: '100%', borderTop: '1px solid #ef4444' }),
                            zIndex: 100,
                          }}
                        />
                      ) : null
                    )}
                  </div>
                </div>
              );
            })}

            {/* Canvas-level draw preview */}
            {canvasDraftRect && (
              <div
                className="absolute pointer-events-none z-60"
                style={{
                  left: canvasDraftRect.x,
                  top: canvasDraftRect.y,
                  width: canvasDraftRect.width,
                  height: canvasDraftRect.height,
                  border: '2px dashed #818cf8',
                  background: 'rgba(99,102,241,0.06)',
                  borderRadius: '4px',
                }}
              >
                <span className="absolute -top-5 left-0 text-[10px] text-indigo-300 whitespace-nowrap">
                  {drawDraft?.tool === 'webpage' ? 'New Page' : drawDraft?.tool === 'section' ? 'New Section' : drawDraft?.tool === 'frame' ? 'New Frame' : drawDraft?.tool}
                  {' '}{canvasDraftRect.width} x {canvasDraftRect.height}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
