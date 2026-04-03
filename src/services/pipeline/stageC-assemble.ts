/**
 * Stage C: Layout Schema Assembly
 *
 * Merges Stage A (top-level regions) and Stage B (region children)
 * into a single hierarchical UINode tree. This is a deterministic step
 * with no LLM calls.
 */

import {
  UINode,
  TopLevelRegion,
  StageBOutput,
  RegionChild,
  StageAOutput,
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
  stageA: StageAOutput,
  stageB: StageBOutput[],
): StageResult<UINode> {
  const start = Date.now();

  try {
    const childrenByRegion = new Map<string, StageBOutput>();
    for (const b of stageB) {
      childrenByRegion.set(b.regionId, b);
    }

    const rootChildren: UINode[] = stageA.regions.map(
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
        width: stageA.viewport.width,
        height: stageA.viewport.height,
      },
      children: rootChildren,
      confidence: 1.0,
    };

    const totalNodes = countNodes(root);
    const maxDepth = measureDepth(root);

    console.log(
      `[Stage C] Assembled ${totalNodes} nodes (depth ${maxDepth}) in ${Date.now() - start}ms`,
    );

    return {
      stage: 'assemble',
      data: root,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stage C] Error:', message);
    return {
      stage: 'assemble',
      data: {
        id: 'root',
        type: 'page',
        bounds: {
          x: 0,
          y: 0,
          width: stageA.viewport.width,
          height: stageA.viewport.height,
        },
        children: [],
        confidence: 1.0,
      },
      durationMs: Date.now() - start,
      error: `Stage C failed: ${message}`,
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
