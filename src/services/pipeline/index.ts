/**
 * Pipeline Orchestrator
 *
 * Runs the full staged pipeline:
 *   A → B → C → D → E
 *
 * This file provides a non-streaming orchestrator used by
 * parse-screenshot and parse-screenshots API routes.
 * The streaming /api/generate route orchestrates stages directly.
 */

export { detectTopLevelRegions, detectMultiScreenshotRegions, detectScreensInImage } from './stageA-regions';
export { extractAllRegionChildren } from './stageB-children';
export { assembleSchema } from './stageC-assemble';
export { repairAndValidate } from './stageD-repair';
export { renderToPage } from './stageE-render';
export { generateComponentCode } from './stageF-codegen';
