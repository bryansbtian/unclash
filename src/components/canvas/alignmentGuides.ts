import { WireframeNode } from '@/types/schema';

// ── Types ─────────────────────────────────────────────────
export interface AlignmentGuide {
  axis: 'x' | 'y';   // x = vertical line, y = horizontal line
  position: number;   // px in canvas coordinates
}

export interface SnapResult {
  x: number;
  y: number;
  guides: AlignmentGuide[];
}

const SNAP_THRESHOLD = 8; // px – distance within which to snap

// ── Compute snap positions from sibling nodes ─────────────

/**
 * Given a node being dragged (proposedX, proposedY, width, height)
 * and a list of all other sibling nodes, returns the snapped position
 * and active guide lines to render.
 */
export function computeSnap(
  proposedX: number,
  proposedY: number,
  width: number,
  height: number,
  siblings: WireframeNode[],
  pageWidth: number,
  pageHeight: number,
): SnapResult {
  const guides: AlignmentGuide[] = [];

  // Edges / center of the dragged node
  const dragLeft = proposedX;
  const dragRight = proposedX + width;
  const dragCenterX = proposedX + width / 2;
  const dragTop = proposedY;
  const dragBottom = proposedY + height;
  const dragCenterY = proposedY + height / 2;

  // Collect reference positions from siblings + page edges
  const xPositions: number[] = [0, pageWidth, pageWidth / 2]; // page left, right, center
  const yPositions: number[] = [0, pageHeight, pageHeight / 2]; // page top, bottom, center

  for (const sib of siblings) {
    xPositions.push(sib.x, sib.x + sib.width, sib.x + sib.width / 2);
    yPositions.push(sib.y, sib.y + sib.height, sib.y + sib.height / 2);
  }

  let snappedX = proposedX;
  let snappedY = proposedY;
  let bestDx = SNAP_THRESHOLD + 1;
  let bestDy = SNAP_THRESHOLD + 1;

  // ── X-axis snapping (vertical guide lines) ──────────────
  for (const refX of xPositions) {
    // Check dragged left edge ↔ reference
    const dLeft = Math.abs(dragLeft - refX);
    if (dLeft < bestDx) {
      bestDx = dLeft;
      snappedX = refX;
    }
    // Check dragged right edge ↔ reference
    const dRight = Math.abs(dragRight - refX);
    if (dRight < bestDx) {
      bestDx = dRight;
      snappedX = refX - width;
    }
    // Check dragged center ↔ reference
    const dCenter = Math.abs(dragCenterX - refX);
    if (dCenter < bestDx) {
      bestDx = dCenter;
      snappedX = refX - width / 2;
    }
  }

  // ── Y-axis snapping (horizontal guide lines) ────────────
  for (const refY of yPositions) {
    const dTop = Math.abs(dragTop - refY);
    if (dTop < bestDy) {
      bestDy = dTop;
      snappedY = refY;
    }
    const dBottom = Math.abs(dragBottom - refY);
    if (dBottom < bestDy) {
      bestDy = dBottom;
      snappedY = refY - height;
    }
    const dCenter = Math.abs(dragCenterY - refY);
    if (dCenter < bestDy) {
      bestDy = dCenter;
      snappedY = refY - height / 2;
    }
  }

  // ── Collect active guide lines ──────────────────────────
  // Only show guides for edges that actually snapped
  if (bestDx <= SNAP_THRESHOLD) {
    // Find which reference position we snapped to
    const snappedLeft = snappedX;
    const snappedRight = snappedX + width;
    const snappedCx = snappedX + width / 2;
    for (const refX of xPositions) {
      if (Math.abs(snappedLeft - refX) < 0.5 ||
          Math.abs(snappedRight - refX) < 0.5 ||
          Math.abs(snappedCx - refX) < 0.5) {
        guides.push({ axis: 'x', position: refX });
      }
    }
  }

  if (bestDy <= SNAP_THRESHOLD) {
    const snappedTop = snappedY;
    const snappedBottom = snappedY + height;
    const snappedCy = snappedY + height / 2;
    for (const refY of yPositions) {
      if (Math.abs(snappedTop - refY) < 0.5 ||
          Math.abs(snappedBottom - refY) < 0.5 ||
          Math.abs(snappedCy - refY) < 0.5) {
        guides.push({ axis: 'y', position: refY });
      }
    }
  }

  return {
    x: bestDx <= SNAP_THRESHOLD ? snappedX : proposedX,
    y: bestDy <= SNAP_THRESHOLD ? snappedY : proposedY,
    guides,
  };
}
