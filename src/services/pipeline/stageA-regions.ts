/**
 * Stage A: Top-Level Region Detection
 *
 * Uses Anthropic tool-based structured outputs to detect only
 * the major page regions (header, sidebar, main-content, etc.).
 * No leaf components are extracted in this stage.
 */

import { z } from 'zod';
import {
  StageAOutput,
  StageAOutputSchema,
  TopLevelRegionSchema,
  StageResult,
} from '@/types/pipeline';
import { TOP_LEVEL_REGION_PROMPT } from './prompts';
import {
  dataUrlToAnthropicBlock,
  generateStructuredObject,
} from '@/services/anthropic';

export async function detectTopLevelRegions(
  imageDataUrl: string,
  userPrompt: string | undefined,
  model: string,
): Promise<StageResult<StageAOutput>> {
  const start = Date.now();

  try {
    const userText = userPrompt
      ? `Analyze this screenshot and identify top-level regions. Context: ${userPrompt}`
      : 'Analyze this screenshot and identify top-level page regions.';

    const parsed = await generateStructuredObject({
      model,
      system: TOP_LEVEL_REGION_PROMPT,
      userContent: [
        dataUrlToAnthropicBlock(imageDataUrl),
        { type: 'text', text: userText },
      ],
      schema: StageAOutputSchema,
      toolName: 'top_level_regions',
      toolDescription:
        'Return the screenshot viewport dimensions and all structurally meaningful, non-overlapping top-level regions.',
      maxTokens: 4096,
      temperature: 0.1,
    });

    console.log(
      `[Stage A] Detected ${parsed.regions.length} top-level regions in ${Date.now() - start}ms`,
    );

    return {
      stage: 'regions',
      data: parsed,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stage A] Error:', message);
    return {
      stage: 'regions',
      data: { viewport: { width: 1440, height: 900 }, regions: [] },
      durationMs: Date.now() - start,
      error: `Stage A failed: ${message}`,
    };
  }
}

const MultiPageRegionsSchema = z.object({
  pages: z.array(
    z.object({
      pageId: z.string(),
      pageName: z.string(),
      viewport: z.object({
        width: z.number(),
        height: z.number(),
      }),
      regions: z.array(TopLevelRegionSchema),
    }),
  ),
});

export async function detectMultiScreenshotRegions(
  imageDataUrls: string[],
  userPrompt: string | undefined,
  model: string,
): Promise<
  StageResult<{
    pages: Array<{ pageId: string; pageName: string; stageA: StageAOutput }>;
  }>
> {
  const start = Date.now();

  try {
    const userText = userPrompt
      ? `Analyze these ${imageDataUrls.length} screenshots. Determine if they show the same or different pages. ${userPrompt}`
      : `You have ${imageDataUrls.length} screenshots. Determine which show the same page vs different pages, then identify top-level regions for each distinct page.`;

    const parsed = await generateStructuredObject({
      model,
      system: `${TOP_LEVEL_REGION_PROMPT}

You are analyzing MULTIPLE screenshots. First determine if they show the same page or different pages. Then for each distinct page, return the top-level regions.`,
      userContent: [
        ...imageDataUrls.map((url) => dataUrlToAnthropicBlock(url)),
        { type: 'text', text: userText },
      ],
      schema: MultiPageRegionsSchema,
      toolName: 'multi_page_regions',
      toolDescription:
        'Group screenshots into distinct pages and return the viewport and top-level regions for each distinct page.',
      maxTokens: 8192,
      temperature: 0.1,
    });

    if (!parsed.pages?.length) {
      return {
        stage: 'regions',
        data: { pages: [] },
        durationMs: Date.now() - start,
        error: 'No structured output from model',
      };
    }

    const pages = parsed.pages.map((p) => ({
      pageId: p.pageId,
      pageName: p.pageName,
      stageA: { viewport: p.viewport, regions: p.regions } as StageAOutput,
    }));

    console.log(
      `[Stage A Multi] Detected ${pages.length} pages in ${Date.now() - start}ms`,
    );

    return {
      stage: 'regions',
      data: { pages },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stage A Multi] Error:', message);
    return {
      stage: 'regions',
      data: { pages: [] },
      durationMs: Date.now() - start,
      error: `Stage A multi failed: ${message}`,
    };
  }
}
