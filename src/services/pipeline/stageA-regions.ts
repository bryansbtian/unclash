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

// ── Single-image multi-screen detection ──────────────────────

const ScreenDetectionSchema = z.object({
  screenCount: z.number().int().min(1),
  viewportType: z.enum(['mobile', 'tablet', 'desktop']),
  screens: z.array(
    z.object({
      name: z.string(),
      position: z.enum(['left', 'center-left', 'center', 'center-right', 'right', 'full']),
      description: z.string(),
    }),
  ),
});

export type ScreenDetectionResult = {
  screenCount: number;
  viewportType: 'mobile' | 'tablet' | 'desktop';
  screens: Array<{ name: string; position: string; description: string }>;
};

export async function detectScreensInImage(
  imageDataUrl: string,
  model: string,
): Promise<StageResult<ScreenDetectionResult>> {
  const start = Date.now();

  try {
    const parsed = await generateStructuredObject({
      model,
      system: `You are a UI analysis engine. Your task is to detect how many distinct mobile/web screens or app frames are visible side-by-side in a single screenshot image, and identify the viewport type.

A "screen" is a complete, self-contained app page or view — typically shown as a mobile phone frame or a distinct UI panel with its own background, content, and navigation.

Rules:
- viewportType: "mobile" if the screens are phone-sized (portrait, narrow UI, ~390px wide), "tablet" if iPad-sized, "desktop" if full browser/web app layout
- If the image shows ONE screen or page: return screenCount=1, screens=[{name:"Home", position:"full", description:"..."}]
- If the image shows MULTIPLE side-by-side screens (e.g. 3 mobile phones next to each other): return the exact count and describe each
- Common screen counts: 1, 2, 3, 4
- Position values from left to right: "left", "center-left", "center", "center-right", "right"
- For 2 screens: use "left" and "right"
- For 3 screens: use "left", "center", "right"
- Give each screen a descriptive name based on its visible content (e.g. "Transactions History", "Wallet", "Portfolio")`,
      userContent: [
        dataUrlToAnthropicBlock(imageDataUrl),
        { type: 'text', text: 'How many distinct screens are shown? What is the viewport type (mobile/tablet/desktop)? Describe each screen.' },
      ],
      schema: ScreenDetectionSchema,
      toolName: 'detect_screens',
      toolDescription: 'Return the number of distinct screens, their viewport type, and describe each one.',
      maxTokens: 1024,
      temperature: 0,
    });

    console.log(`[Screen Detection] Found ${parsed.screenCount} ${parsed.viewportType} screen(s) in ${Date.now() - start}ms`);

    return {
      stage: 'regions',
      data: { screenCount: parsed.screenCount, viewportType: parsed.viewportType, screens: parsed.screens },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Screen Detection] Error:', message);
    return {
      stage: 'regions',
      data: { screenCount: 1, viewportType: 'desktop', screens: [{ name: 'Home', position: 'full', description: 'Single screen' }] },
      durationMs: Date.now() - start,
      error: `Screen detection failed: ${message}`,
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
