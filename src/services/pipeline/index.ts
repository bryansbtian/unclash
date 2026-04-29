/**
 * Pipeline Orchestrator
 *
 * Runs the full staged pipeline:
 *   1 → 2 → 3 → 4 → 5
 *
 * This file provides a non-streaming orchestrator used by
 * parse-screenshot and parse-screenshots API routes.
 * The streaming /api/generate route orchestrates stages directly.
 */

export { detectTopLevelRegions, detectMultiScreenshotRegions, detectScreensInImage } from './stage1-regions';
export { extractAllRegionChildren } from './stage2-children';
export { assembleSchema } from './stage3-assemble';
export { repairAndValidate } from './stage4-repair';
export { renderToPage } from './stage5-render';
export { generateComponentCode } from './stage6-codegen';
