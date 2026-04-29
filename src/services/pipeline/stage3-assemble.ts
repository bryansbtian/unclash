/**
 * Stage 3: Layout Schema Assembly
 *
 * Merges Stage 1 (top-level regions) and Stage 2 (region children)
 * into a single hierarchical UINode tree. This is a deterministic step
 * with no LLM calls.
 */

import {
  UINode,
  TopLevelRegion,
  Stage2Output,
  RegionChild,
  Stage1Output,
  StageResult,
} from '@/types/pipeline';

function n2u<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v;
}

/**
 * Convert a RegionChild to a UINode with absolute page coordinates.
 *
 * The AI returns nested child bounds relative to the immediate parent,
 * so we accumulate the parent's absolute origin at each level.
 * For direct children of a region, parentAbsOrigin = region bounds.
 */
function regionChildToUINode(
  child: RegionChild,
  parentAbsOrigin: { x: number; y: number },
  parentId: string,
): UINode {
  const absX = parentAbsOrigin.x + child.bounds.x;
  const absY = parentAbsOrigin.y + child.bounds.y;

  return {
    id: child.id,
    type: child.type,
    label: n2u(child.label),
    bounds: {
      x: absX,
      y: absY,
      width: child.bounds.width,
      height: child.bounds.height,
    },
    text: n2u(child.text),
    children: child.children.map((c) =>
      regionChildToUINode(c, { x: absX, y: absY }, child.id),
    ),
    parentId,
    layoutDirection: n2u(child.layoutDirection),
    isRepeated: n2u(child.isRepeated),
    repeatCount: n2u(child.repeatCount),
    styleHints: n2u(child.styleHints),
    confidence: child.confidence,
  };
}

export function assembleSchema(
  stage1: Stage1Output,
  stage2: Stage2Output[],
): StageResult<UINode> {
  const start = Date.now();

  try {
    const childrenByRegion = new Map<string, Stage2Output>();
    for (const b of stage2) {
      childrenByRegion.set(b.regionId, b);
    }

    const rootChildren: UINode[] = stage1.regions.map(
      (region: TopLevelRegion) => {
        const regionChildren = childrenByRegion.get(region.id);

        const children: UINode[] = regionChildren
          ? regionChildren.children.map((c) =>
              regionChildToUINode(c, region.bounds, region.id),
            )
          : [];

        return {
          id: region.id,
          type: region.type,
          label: n2u(region.label),
          bounds: region.bounds,
          children,
          confidence: region.confidence,
        };
      },
    );

    const root: UINode = {
      id: 'root',
      type: 'page',
      bounds: {
        x: 0,
        y: 0,
        width: stage1.viewport.width,
        height: stage1.viewport.height,
      },
      children: rootChildren,
      confidence: 1.0,
    };

    const totalNodes = countNodes(root);
    const maxDepth = measureDepth(root);

    console.log(
      `[Stage 3] Assembled ${totalNodes} nodes (depth ${maxDepth}) in ${Date.now() - start}ms`,
    );

    return {
      stage: 'assemble',
      data: root,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stage 3] Error:', message);
    return {
      stage: 'assemble',
      data: {
        id: 'root',
        type: 'page',
        bounds: {
          x: 0,
          y: 0,
          width: stage1.viewport.width,
          height: stage1.viewport.height,
        },
        children: [],
        confidence: 1.0,
      },
      durationMs: Date.now() - start,
      error: `Stage 3 failed: ${message}`,
    };
  }
}

function countNodes(node: UINode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);
}

function measureDepth(node: UINode): number {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(measureDepth));
}
