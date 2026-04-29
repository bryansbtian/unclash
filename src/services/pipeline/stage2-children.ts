/**
 * Stage 2: Region Component Extraction
 *
 * For each top-level region, detect nested children and leaf components.
 * Uses Anthropic tool-based structured outputs per region and runs regions in parallel for speed.
 */

import {
  TopLevelRegion,
  Stage2Output,
  Stage2OutputSchema,
  StageResult,
} from '@/types/pipeline';
import { REGION_CHILDREN_PROMPT } from './prompts';
import {
  dataUrlToAnthropicBlock,
  generateStructuredObject,
} from '@/services/anthropic';

async function extractRegionChildren(
  imageDataUrl: string,
  region: TopLevelRegion,
  model: string,
): Promise<Stage2Output> {
  const regionContext = `Region to analyze:
- id: "${region.id}"
- type: "${region.type}"
- bounds: x=${region.bounds.x}, y=${region.bounds.y}, width=${region.bounds.width}, height=${region.bounds.height}
${region.label ? `- label: "${region.label}"` : ''}

Detect all child components inside this region. All child bounds must be RELATIVE to the region's top-left corner (0,0 = top-left of the region).

Return a HIGH-FIDELITY wireframe tree:
- preserve icon placement, alignment, and spacing
- avoid redundant wrapper containers
- add styleHints key:value strings whenever alignment, padding, radius, emphasis, icon placement, or typography is visually clear.`;

  return generateStructuredObject({
    model,
    system: REGION_CHILDREN_PROMPT,
    userContent: [
      dataUrlToAnthropicBlock(imageDataUrl),
      { type: 'text', text: regionContext },
    ],
    schema: Stage2OutputSchema,
    toolName: 'region_children',
    toolDescription:
      'Return the complete semantic child tree for the requested top-level region, with child bounds relative to the region origin.',
    maxTokens: 8192,
    temperature: 0.1,
  });
}

export async function extractAllRegionChildren(
  imageDataUrl: string,
  regions: TopLevelRegion[],
  model: string,
): Promise<StageResult<Stage2Output[]>> {
  const start = Date.now();

  try {
    // Run region extractions with limited concurrency to avoid rate limit bursts.
    const CONCURRENCY = 2;
    const results: Stage2Output[] = [];
    for (let i = 0; i < regions.length; i += CONCURRENCY) {
      const batch = regions.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((region) =>
          extractRegionChildren(imageDataUrl, region, model).catch(
            (err) => {
              console.warn(
                `[Stage 2] Failed for region "${region.id}":`,
                err instanceof Error ? err.message : err,
              );
              return { regionId: region.id, children: [] } as Stage2Output;
            },
          ),
        ),
      );
      results.push(...batchResults);
    }

    const totalChildren = results.reduce(
      (sum, r) => sum + countChildren(r.children),
      0,
    );

    console.log(
      `[Stage 2] Extracted ${totalChildren} child nodes across ${regions.length} regions in ${Date.now() - start}ms`,
    );

    return {
      stage: 'children',
      data: results,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stage 2] Error:', message);
    return {
      stage: 'children',
      data: [],
      durationMs: Date.now() - start,
      error: `Stage 2 failed: ${message}`,
    };
  }
}

function countChildren(
  children: Stage2Output['children'],
): number {
  return children.reduce(
    (sum, c) => sum + 1 + countChildren(c.children),
    0,
  );
}
