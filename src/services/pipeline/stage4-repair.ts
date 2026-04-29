/**
 * Stage 4: Schema Repair and Validation
 *
 * Deterministic validation and repair of the assembled UINode tree.
 * Fixes invalid nesting, merges duplicates, normalizes repeated
 * structures, removes empty containers. Works for any page type.
 */

import {
  UINode,
  UINodeType,
  ValidatedUISchema,
  SchemaWarning,
  Bounds,
  StageResult,
} from '@/types/pipeline';

const TEXT_TYPES = new Set<UINodeType>([
  'text',
  'label',
  'badge',
]);

const LEAF_TYPES = new Set<UINodeType>([
  'text',
  'label',
  'button',
  'icon-button',
  'input',
  'search-input',
  'avatar',
  'badge',
  'chip',
  'slider',
  'logo',
  'image-placeholder',
  'toggle',
  'divider',
]);

const NESTING_FORBIDDEN: Record<string, Set<UINodeType>> = {
  button: new Set(['table', 'chart', 'form', 'sidebar', 'card-grid', 'feature-grid']),
  'icon-button': new Set(['table', 'chart', 'form', 'sidebar', 'card-grid', 'feature-grid']),
  text: new Set(['table', 'chart', 'sidebar', 'card-grid', 'feature-grid', 'form', 'nav-group']),
  label: new Set(['table', 'chart', 'sidebar', 'card-grid', 'feature-grid', 'form', 'nav-group']),
};

const TOP_LEVEL_PREFERRED = new Set<UINodeType>([
  'sidebar',
  'header',
  'topbar',
  'footer',
  'modal-overlay',
]);

const GENERIC_LAYOUT_TYPES = new Set<UINodeType>([
  'container',
  'section',
  'hero-content',
  'feature-grid',
  'card-grid',
  'CTA-group',
  'list',
  'nav-group',
  'filter-chip-row',
  'form',
  'form-row',
  'tabs',
]);

export function repairAndValidate(
  root: UINode,
  pageWidth: number,
  pageHeight: number,
): StageResult<ValidatedUISchema> {
  const start = Date.now();
  const warnings: SchemaWarning[] = [];

  try {
    let tree = structuredClone(root);

    tree = repairNesting(tree, warnings);
    tree = promoteTopLevel(tree, warnings);
    tree = mergeDuplicateText(tree, warnings);
    tree = normalizeRepeated(tree, warnings);
    tree = removeEmptyContainers(tree, warnings);
    tree = collapseRedundantContainers(tree, warnings);
    const pageBounds: Bounds = {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    };
    clampBounds(tree, pageBounds, warnings);
    resolveSiblingOverlaps(tree, warnings);
    // Clip structural overlaps (e.g. full-height sidebar overlapping full-width topbar)
    // that move-based deconfliction can't handle because moves would exceed page bounds.
    clipStructuralOverlaps(tree, warnings);
    clampBounds(tree, pageBounds, warnings);
    assignParentIds(tree, null);

    const stats = computeStats(tree);

    console.log(
      `[Stage 4] Validated: ${stats.totalNodes} nodes, ${warnings.length} warnings in ${Date.now() - start}ms`,
    );

    return {
      stage: 'validate',
      data: {
        root: tree,
        warnings,
        pageWidth,
        pageHeight,
        stats,
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stage 4] Error:', message);
    return {
      stage: 'validate',
      data: {
        root,
        warnings,
        pageWidth,
        pageHeight,
        stats: { totalNodes: 0, maxDepth: 0, typeCounts: {} },
      },
      durationMs: Date.now() - start,
      error: `Stage 4 failed: ${message}`,
    };
  }
}

function repairNesting(node: UINode, warnings: SchemaWarning[]): UINode {
  const forbidden = NESTING_FORBIDDEN[node.type];
  if (!forbidden && !TEXT_TYPES.has(node.type) && !LEAF_TYPES.has(node.type)) {
    node.children = node.children.map((c) => repairNesting(c, warnings));
    return node;
  }

  if (TEXT_TYPES.has(node.type) && node.children.length > 0) {
    warnings.push({
      nodeId: node.id,
      rule: 'text-no-children',
      message: `Text/label node "${node.id}" had ${node.children.length} children; promoted to siblings`,
      severity: 'warning',
      autoFixed: true,
    });
    node.children = [];
    return node;
  }

  if (forbidden) {
    const promoted: UINode[] = [];
    const kept: UINode[] = [];
    for (const child of node.children) {
      if (forbidden.has(child.type)) {
        warnings.push({
          nodeId: child.id,
          rule: 'invalid-nesting',
          message: `${child.type} cannot be nested inside ${node.type}; promoted`,
          severity: 'warning',
          autoFixed: true,
        });
        promoted.push(child);
      } else {
        kept.push(child);
      }
    }
    node.children = kept.map((c) => repairNesting(c, warnings));
    if (promoted.length > 0) {
      node.children.push(...promoted.map((c) => repairNesting(c, warnings)));
    }
  } else {
    node.children = node.children.map((c) => repairNesting(c, warnings));
  }

  return node;
}

function promoteTopLevel(node: UINode, warnings: SchemaWarning[]): UINode {
  if (node.type !== 'page') return node;

  const promote = (children: UINode[]): UINode[] => {
    const result: UINode[] = [];
    for (const child of children) {
      result.push(child);
      const toPromote: UINode[] = [];
      child.children = child.children.filter((gc) => {
        if (TOP_LEVEL_PREFERRED.has(gc.type) && child.type !== 'page') {
          toPromote.push(gc);
          return false;
        }
        return true;
      });
      for (const p of toPromote) {
        warnings.push({
          nodeId: p.id,
          rule: 'promote-top-level',
          message: `${p.type} "${p.id}" promoted to root level`,
          severity: 'info',
          autoFixed: true,
        });
        result.push(p);
      }
    }
    return result;
  };

  node.children = promote(node.children);
  return node;
}

function mergeDuplicateText(
  node: UINode,
  warnings: SchemaWarning[],
): UINode {
  node.children = node.children.map((c) => mergeDuplicateText(c, warnings));

  const textNodes = node.children.filter((c) => TEXT_TYPES.has(c.type));
  const nonText = node.children.filter((c) => !TEXT_TYPES.has(c.type));
  const merged: UINode[] = [];
  const used = new Set<number>();

  for (let i = 0; i < textNodes.length; i++) {
    if (used.has(i)) continue;
    let current = textNodes[i];
    for (let j = i + 1; j < textNodes.length; j++) {
      if (used.has(j)) continue;
      if (boundsOverlap(current.bounds, textNodes[j].bounds, 0.5)) {
        if (textNodes[j].text && textNodes[j].text !== current.text) {
          current = {
            ...current,
            text: [current.text, textNodes[j].text].filter(Boolean).join('\n'),
          };
        }
        used.add(j);
        warnings.push({
          nodeId: textNodes[j].id,
          rule: 'merge-duplicate-text',
          message: `Merged overlapping text "${textNodes[j].id}" into "${current.id}"`,
          severity: 'info',
          autoFixed: true,
        });
      }
    }
    merged.push(current);
  }

  node.children = [...nonText, ...merged];
  return node;
}

function normalizeRepeated(
  node: UINode,
  warnings: SchemaWarning[],
): UINode {
  node.children = node.children.map((c) => normalizeRepeated(c, warnings));

  const groups = new Map<string, UINode[]>();
  for (const child of node.children) {
    const key = `${child.type}:${child.bounds.width}:${child.bounds.height}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(child);
  }

  for (const [, group] of groups) {
    if (group.length >= 3 && !group[0].isRepeated) {
      for (const item of group) {
        item.isRepeated = true;
        item.repeatCount = group.length;
      }
      warnings.push({
        nodeId: group[0].id,
        rule: 'normalize-repeated',
        message: `Marked ${group.length} similar ${group[0].type} nodes as repeated`,
        severity: 'info',
        autoFixed: true,
      });
    }
  }

  return node;
}

function removeEmptyContainers(
  node: UINode,
  warnings: SchemaWarning[],
): UINode {
  node.children = node.children.map((c) =>
    removeEmptyContainers(c, warnings),
  );

  node.children = node.children.filter((child) => {
    const isLayoutContainer =
      child.type === 'container' || child.type === 'section';
    if (isLayoutContainer && child.children.length === 0 && !child.text) {
      warnings.push({
        nodeId: child.id,
        rule: 'remove-empty',
        message: `Removed empty ${child.type} "${child.id}"`,
        severity: 'info',
        autoFixed: true,
      });
      return false;
    }
    return true;
  });

  node.children = node.children.flatMap((child) => {
    const isGenericContainer = child.type === 'container';
    if (isGenericContainer && child.children.length === 1 && !child.text) {
      warnings.push({
        nodeId: child.id,
        rule: 'flatten-single-child',
        message: `Flattened single-child container "${child.id}"`,
        severity: 'info',
        autoFixed: true,
      });
      return child.children;
    }
    return [child];
  });

  return node;
}

function collapseRedundantContainers(
  node: UINode,
  warnings: SchemaWarning[],
): UINode {
  node.children = node.children.map((child) =>
    collapseRedundantContainers(child, warnings),
  );

  const flattenedChildren: UINode[] = [];
  for (const child of node.children) {
    if (
      isFlattenableContainer(node, child) &&
      shouldFlattenContainer(node, child)
    ) {
      warnings.push({
        nodeId: child.id,
        rule: 'collapse-redundant-container',
        message: `Flattened redundant ${child.type} "${child.id}" to reduce overlap`,
        severity: 'info',
        autoFixed: true,
      });
      flattenedChildren.push(...child.children);
      continue;
    }
    flattenedChildren.push(child);
  }

  node.children = mergeOverlappingGenericSiblings(flattenedChildren, warnings);
  return node;
}

function clampBounds(
  node: UINode,
  containerBounds: Bounds,
  warnings: SchemaWarning[],
): void {
  const before = { ...node.bounds };
  const next = clampRectToBounds(node.bounds, containerBounds);
  const dx = next.x - node.bounds.x;
  const dy = next.y - node.bounds.y;

  if (dx !== 0 || dy !== 0) {
    translateSubtree(node, dx, dy);
  }

  node.bounds.width = next.width;
  node.bounds.height = next.height;

  if (
    before.x !== node.bounds.x ||
    before.y !== node.bounds.y ||
    before.width !== node.bounds.width ||
    before.height !== node.bounds.height
  ) {
    warnings.push({
      nodeId: node.id,
      rule: 'clamp-bounds',
      message: `Clamped "${node.id}" to fit within parent bounds`,
      severity: 'info',
      autoFixed: true,
    });
  }

  for (const child of node.children) {
    clampBounds(child, node.bounds, warnings);
  }
}

function assignParentIds(node: UINode, parentId: string | null): void {
  node.parentId = parentId;
  for (const child of node.children) {
    assignParentIds(child, node.id);
  }
}

function resolveSiblingOverlaps(
  node: UINode,
  warnings: SchemaWarning[],
): void {
  for (const child of node.children) {
    resolveSiblingOverlaps(child, warnings);
  }

  if (node.children.length < 2) return;

  const layout = inferSiblingLayout(node);
  if (layout === 'row') {
    deconflictRow(node.children, node.bounds, warnings);
    return;
  }
  if (layout === 'column') {
    deconflictColumn(node.children, node.bounds, warnings);
    return;
  }
  if (layout === 'grid') {
    deconflictGrid(node.children, node.bounds, warnings);
  }
}

function inferSiblingLayout(
  node: UINode,
): 'row' | 'column' | 'grid' | 'unknown' {
  if (node.layoutDirection && node.layoutDirection !== 'unknown') {
    return node.layoutDirection;
  }

  const children = node.children;
  if (children.length < 2) return 'unknown';

  const avgWidth =
    children.reduce((sum, child) => sum + child.bounds.width, 0) / children.length;
  const avgHeight =
    children.reduce((sum, child) => sum + child.bounds.height, 0) / children.length;

  const rowGroups = clusterCenters(
    children.map((child) => child.bounds.y + child.bounds.height / 2),
    Math.max(12, avgHeight * 0.65),
  );
  const colGroups = clusterCenters(
    children.map((child) => child.bounds.x + child.bounds.width / 2),
    Math.max(12, avgWidth * 0.65),
  );

  if (rowGroups > 1 && colGroups > 1) return 'grid';
  if (rowGroups === 1 && colGroups > 1) return 'row';
  if (colGroups === 1 && rowGroups > 1) return 'column';

  const centersX = children.map((child) => child.bounds.x + child.bounds.width / 2);
  const centersY = children.map((child) => child.bounds.y + child.bounds.height / 2);
  const xSpread = Math.max(...centersX) - Math.min(...centersX);
  const ySpread = Math.max(...centersY) - Math.min(...centersY);

  if (ySpread <= avgHeight * 0.75 && xSpread > avgWidth * 1.25) return 'row';
  if (xSpread <= avgWidth * 0.75 && ySpread > avgHeight * 1.25) return 'column';

  return 'unknown';
}

function deconflictRow(
  nodes: UINode[],
  containerBounds: Bounds,
  warnings: SchemaWarning[],
): void {
  const sorted = [...nodes].sort(
    (a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y,
  );
  const gap = estimateGap(sorted, 'row');
  const maxRight = containerBounds.x + containerBounds.width;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (!hasSubstantialAxisOverlap(prev.bounds, current.bounds, 'y')) continue;

    const minX = prev.bounds.x + prev.bounds.width + gap;
    if (current.bounds.x >= minX) continue;
    if (minX + current.bounds.width > maxRight) continue;

    const dx = minX - current.bounds.x;
    translateSubtree(current, dx, 0);
    warnings.push({
      nodeId: current.id,
      rule: 'deconflict-row',
      message: `Shifted "${current.id}" horizontally to reduce sibling overlap`,
      severity: 'info',
      autoFixed: true,
    });
  }
}

function deconflictColumn(
  nodes: UINode[],
  containerBounds: Bounds,
  warnings: SchemaWarning[],
): void {
  const sorted = [...nodes].sort(
    (a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x,
  );
  const gap = estimateGap(sorted, 'column');
  const maxBottom = containerBounds.y + containerBounds.height;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (!hasSubstantialAxisOverlap(prev.bounds, current.bounds, 'x')) continue;

    const minY = prev.bounds.y + prev.bounds.height + gap;
    if (current.bounds.y >= minY) continue;
    if (minY + current.bounds.height > maxBottom) continue;

    const dy = minY - current.bounds.y;
    translateSubtree(current, 0, dy);
    warnings.push({
      nodeId: current.id,
      rule: 'deconflict-column',
      message: `Shifted "${current.id}" vertically to reduce sibling overlap`,
      severity: 'info',
      autoFixed: true,
    });
  }
}

function deconflictGrid(
  nodes: UINode[],
  containerBounds: Bounds,
  warnings: SchemaWarning[],
): void {
  const avgHeight =
    nodes.reduce((sum, node) => sum + node.bounds.height, 0) / nodes.length;
  const rowTolerance = Math.max(12, avgHeight * 0.7);
  const rows: UINode[][] = [];
  const sorted = [...nodes].sort(
    (a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x,
  );

  for (const node of sorted) {
    const centerY = node.bounds.y + node.bounds.height / 2;
    const row = rows.find((candidate) => {
      const sample = candidate[0];
      const sampleCenter = sample.bounds.y + sample.bounds.height / 2;
      return Math.abs(sampleCenter - centerY) <= rowTolerance;
    });
    if (row) row.push(node);
    else rows.push([node]);
  }

  for (const row of rows) {
    deconflictRow(row, containerBounds, warnings);
  }

  const rowGap = Math.max(12, Math.round(avgHeight * 0.18));
  const maxBottom = containerBounds.y + containerBounds.height;

  for (let i = 1; i < rows.length; i++) {
    const prevBottom = Math.max(...rows[i - 1].map((rowNode) => rowNode.bounds.y + rowNode.bounds.height));
    const currentTop = Math.min(...rows[i].map((rowNode) => rowNode.bounds.y));
    const currentBottom = Math.max(...rows[i].map((rowNode) => rowNode.bounds.y + rowNode.bounds.height));
    const minTop = prevBottom + rowGap;
    if (currentTop >= minTop) continue;
    if (currentBottom + (minTop - currentTop) > maxBottom) continue;

    const dy = minTop - currentTop;
    for (const rowNode of rows[i]) {
      translateSubtree(rowNode, 0, dy);
    }
    warnings.push({
      nodeId: rows[i][0].id,
      rule: 'deconflict-grid',
      message: `Shifted a grid row downward to reduce sibling overlap`,
      severity: 'info',
      autoFixed: true,
    });
  }
}

function estimateGap(nodes: UINode[], layout: 'row' | 'column'): number {
  if (layout === 'row') {
    const avgHeight =
      nodes.reduce((sum, node) => sum + node.bounds.height, 0) / nodes.length;
    return Math.max(8, Math.round(avgHeight * 0.18));
  }

  const avgWidth =
    nodes.reduce((sum, node) => sum + node.bounds.width, 0) / nodes.length;
  return Math.max(8, Math.round(avgWidth * 0.12));
}

function translateSubtree(node: UINode, dx: number, dy: number): void {
  node.bounds.x += dx;
  node.bounds.y += dy;
  for (const child of node.children) {
    translateSubtree(child, dx, dy);
  }
}

function clampRectToBounds(
  rect: Bounds,
  containerBounds: Bounds,
): Bounds {
  const minWidth = 10;
  const minHeight = 10;
  const maxX = containerBounds.x + containerBounds.width;
  const maxY = containerBounds.y + containerBounds.height;

  const x = Math.max(containerBounds.x, Math.min(rect.x, maxX - minWidth));
  const y = Math.max(containerBounds.y, Math.min(rect.y, maxY - minHeight));
  const width = Math.max(minWidth, Math.min(rect.width, maxX - x));
  const height = Math.max(minHeight, Math.min(rect.height, maxY - y));

  return { x, y, width, height };
}

function hasSubstantialAxisOverlap(
  a: Bounds,
  b: Bounds,
  axis: 'x' | 'y',
): boolean {
  if (axis === 'x') {
    const overlap = Math.max(
      0,
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    );
    return overlap >= Math.min(a.width, b.width) * 0.25;
  }

  const overlap = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  return overlap >= Math.min(a.height, b.height) * 0.25;
}

function clusterCenters(values: number[], tolerance: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let groups = 1;
  let anchor = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i] - anchor) > tolerance) {
      groups++;
      anchor = sorted[i];
    }
  }

  return groups;
}

function isFlattenableContainer(parent: UINode, child: UINode): boolean {
  return (
    parent.type !== 'page' &&
    GENERIC_LAYOUT_TYPES.has(child.type) &&
    child.children.length > 0 &&
    !child.text &&
    !child.label
  );
}

function shouldFlattenContainer(parent: UINode, child: UINode): boolean {
  // Don't flatten containers with many children — they carry structural intent
  if (child.children.length >= 3) return false;

  const similarityToParent = boundsSimilarity(parent.bounds, child.bounds);
  if (similarityToParent >= 0.97) return true;

  if (child.children.length === 0) return false;

  const largestChildCoverage = Math.max(
    ...child.children.map((grandchild) =>
      boundsSimilarity(child.bounds, grandchild.bounds),
    ),
  );

  const largeChildren = child.children.filter(
    (grandchild) => boundsSimilarity(child.bounds, grandchild.bounds) >= 0.88,
  ).length;

  return largestChildCoverage >= 0.96 || largeChildren >= 3;
}

function mergeOverlappingGenericSiblings(
  children: UINode[],
  warnings: SchemaWarning[],
): UINode[] {
  const merged: UINode[] = [];

  for (const child of children) {
    if (!GENERIC_LAYOUT_TYPES.has(child.type)) {
      merged.push(child);
      continue;
    }

    const existingIndex = merged.findIndex(
      (candidate) =>
        GENERIC_LAYOUT_TYPES.has(candidate.type) &&
        boundsSimilarity(candidate.bounds, child.bounds) >= 0.95,
    );

    if (existingIndex === -1) {
      merged.push(child);
      continue;
    }

    const existing = merged[existingIndex];
    const keeper =
      containerSpecificityScore(child) > containerSpecificityScore(existing) ||
      countDescendants(child) > countDescendants(existing)
        ? child
        : existing;
    const absorbed = keeper.id === child.id ? existing : child;

    const absorbedChildren =
      keeper.id === child.id ? existing.children : child.children;
    const keeperChildren =
      keeper.id === child.id ? child.children : existing.children;

    merged[existingIndex] = {
      ...keeper,
      text: keeper.text || absorbed.text,
      label: keeper.label || absorbed.label,
      confidence: Math.max(keeper.confidence, absorbed.confidence),
      children: mergeUniqueChildren(keeperChildren, absorbedChildren),
    };

    warnings.push({
      nodeId: absorbed.id,
      rule: 'merge-overlapping-container',
      message: `Merged overlapping ${absorbed.type} "${absorbed.id}" into "${merged[existingIndex].id}"`,
      severity: 'info',
      autoFixed: true,
    });
  }

  return merged;
}

function mergeUniqueChildren(primary: UINode[], secondary: UINode[]): UINode[] {
  const seen = new Set(primary.map((child) => child.id));
  const result = [...primary];
  for (const child of secondary) {
    if (seen.has(child.id)) continue;
    seen.add(child.id);
    result.push(child);
  }
  return result;
}

function containerSpecificityScore(node: UINode): number {
  const scores: Partial<Record<UINodeType, number>> = {
    section: 5,
    'feature-grid': 4,
    'card-grid': 4,
    'hero-content': 4,
    'nav-group': 3,
    'filter-chip-row': 3,
    form: 3,
    tabs: 3,
    'form-row': 2,
    list: 2,
    'CTA-group': 2,
    container: 1,
  };
  return scores[node.type] ?? 0;
}

function countDescendants(node: UINode): number {
  return node.children.reduce(
    (sum, child) => sum + 1 + countDescendants(child),
    0,
  );
}

function boundsSimilarity(a: Bounds, b: Bounds): number {
  const overlapX = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const overlapY = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  const overlapArea = overlapX * overlapY;
  const maxArea = Math.max(a.width * a.height, b.width * b.height);
  return maxArea > 0 ? overlapArea / maxArea : 0;
}

function boundsOverlap(
  a: UINode['bounds'],
  b: UINode['bounds'],
  threshold: number,
): boolean {
  const overlapX = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const overlapY = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  const overlapArea = overlapX * overlapY;
  const minArea = Math.min(a.width * a.height, b.width * b.height);
  return minArea > 0 && overlapArea / minArea >= threshold;
}

/**
 * Clip structural overlaps between siblings that have very different orientations
 * (e.g. a tall narrow sidebar overlapping a wide short topbar).
 *
 * Move-based deconfliction fails for these because moving a full-height sidebar
 * down by the topbar height would push its bottom out of bounds.
 * Instead we resize the taller/wider element's leading edge to clear the other.
 *
 * The aspect-ratio guard (< 0.5 vs > 3) restricts this to structural elements
 * only — same-size siblings (cards, nav items) are skipped so deconflictGrid
 * continues to own those.
 */
function clipStructuralOverlaps(
  node: UINode,
  warnings: SchemaWarning[],
): void {
  // Bottom-up: fix children before the parent level
  for (const child of node.children) {
    clipStructuralOverlaps(child, warnings);
  }

  if (node.children.length < 2) return;

  for (let i = 0; i < node.children.length; i++) {
    for (let j = i + 1; j < node.children.length; j++) {
      const a = node.children[i];
      const b = node.children[j];

      // Only handle overlaps between clearly portrait and clearly landscape elements.
      const aAspect = a.bounds.height > 0 ? a.bounds.width / a.bounds.height : 1;
      const bAspect = b.bounds.height > 0 ? b.bounds.width / b.bounds.height : 1;
      const isStructural =
        (aAspect < 0.5 && bAspect > 3) || (aAspect > 3 && bAspect < 0.5);
      if (!isStructural) continue;

      const overlapX = Math.max(
        0,
        Math.min(a.bounds.x + a.bounds.width, b.bounds.x + b.bounds.width) -
          Math.max(a.bounds.x, b.bounds.x),
      );
      const overlapY = Math.max(
        0,
        Math.min(a.bounds.y + a.bounds.height, b.bounds.y + b.bounds.height) -
          Math.max(a.bounds.y, b.bounds.y),
      );

      if (overlapX <= 0 || overlapY <= 0) continue;

      const aArea = a.bounds.width * a.bounds.height;
      const bArea = b.bounds.width * b.bounds.height;
      const overlapArea = overlapX * overlapY;
      const minArea = Math.min(aArea, bArea);
      // Skip trivial (<5%) overlaps
      if (minArea <= 0 || overlapArea / minArea < 0.05) continue;

      if (overlapY <= overlapX) {
        // Resolve on Y axis: clip the taller element's top so it starts below
        // the shorter element's bottom. E.g. sidebar starts below topbar.
        const tallEl = a.bounds.height >= b.bounds.height ? a : b;
        const shortEl = tallEl === a ? b : a;

        const anchorBottom = shortEl.bounds.y + shortEl.bounds.height;
        const oldY = tallEl.bounds.y;
        const oldBottom = tallEl.bounds.y + tallEl.bounds.height;
        const newHeight = oldBottom - anchorBottom;

        if (newHeight >= 20) {
          const dy = anchorBottom - oldY;
          tallEl.bounds.y = anchorBottom;
          tallEl.bounds.height = newHeight;
          // Keep children at the same absolute positions by translating them.
          for (const child of tallEl.children) {
            translateSubtree(child, 0, dy);
          }
          warnings.push({
            nodeId: tallEl.id,
            rule: 'clip-structural-y',
            message: `Clipped "${tallEl.id}" top by ${dy}px to clear "${shortEl.id}"`,
            severity: 'info',
            autoFixed: true,
          });
        }
      } else {
        // Resolve on X axis: clip the wider element's left so it starts after
        // the narrower element's right edge. E.g. topbar starts after sidebar.
        const narrowEl = a.bounds.width <= b.bounds.width ? a : b;
        const wideEl = narrowEl === a ? b : a;

        const anchorRight = narrowEl.bounds.x + narrowEl.bounds.width;
        const oldX = wideEl.bounds.x;
        const oldRight = wideEl.bounds.x + wideEl.bounds.width;
        const newWidth = oldRight - anchorRight;

        if (newWidth >= 20) {
          const dx = anchorRight - oldX;
          wideEl.bounds.x = anchorRight;
          wideEl.bounds.width = newWidth;
          for (const child of wideEl.children) {
            translateSubtree(child, dx, 0);
          }
          warnings.push({
            nodeId: wideEl.id,
            rule: 'clip-structural-x',
            message: `Clipped "${wideEl.id}" left by ${dx}px to clear "${narrowEl.id}"`,
            severity: 'info',
            autoFixed: true,
          });
        }
      }
    }
  }
}

function computeStats(node: UINode): ValidatedUISchema['stats'] {
  const typeCounts: Record<string, number> = {};

  function walk(n: UINode, depth: number): { count: number; maxD: number } {
    typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    let total = 1;
    let maxD = depth;
    for (const c of n.children) {
      const r = walk(c, depth + 1);
      total += r.count;
      maxD = Math.max(maxD, r.maxD);
    }
    return { count: total, maxD };
  }

  const { count, maxD } = walk(node, 1);
  return { totalNodes: count, maxDepth: maxD, typeCounts };
}
