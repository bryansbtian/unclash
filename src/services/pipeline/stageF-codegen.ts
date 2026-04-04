/**
 * Stage F: React Component Code Generation
 *
 * Uses the screenshot to generate a self-contained React functional component
 * (function App) with Tailwind CSS classes and data-unclash-id attributes on
 * every structural element. This is the source of truth for Code mode — it
 * powers the iframe canvas preview and the export.
 */

import { generateText, dataUrlToAnthropicBlock } from '@/services/anthropic';
import { CODE_GEN_PROMPT } from './prompts';
import { StageResult } from '@/types/pipeline';

export async function generateComponentCode(
  imageDataUrl: string,
  viewport: { width: number; height: number },
  model: string,
): Promise<StageResult<{ code: string }>> {
  const start = Date.now();

  try {
    const raw = await generateText({
      model,
      system: CODE_GEN_PROMPT,
      userContent: [
        dataUrlToAnthropicBlock(imageDataUrl),
        {
          type: 'text',
          text: `Recreate this UI as a React App component. Viewport: ${viewport.width}×${viewport.height}px. Every div/section/nav/header/main/aside/footer must have data-unclash-id. Output only the function body starting with \`function App() {\`.`,
        },
      ],
      maxTokens: 8000,
      temperature: 0.1,
    });

    // Strip markdown code fences if the model wraps the output (any language)
    let code = raw
      .replace(/^```[^\n]*\n?/, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    // If the model returned HTML instead of JSX, extract the function body if present,
    // otherwise surface an error rather than silently rendering a blank iframe.
    if (!code.startsWith('function App(') && !code.startsWith('function App ')) {
      // Try to salvage: look for the function body anywhere in the output
      const fnMatch = code.match(/(function App\s*\([\s\S]*)/);
      if (fnMatch) {
        code = fnMatch[1].trim();
      } else {
        console.warn('[Stage F] Model did not return a function App() body. Raw output:', raw.slice(0, 200));
        return {
          stage: 'codegen',
          data: { code: '' },
          durationMs: Date.now() - start,
          error: 'Model returned invalid output (expected function App() body). Please try again.',
        };
      }
    }

    console.log(
      `[Painting your UI] Generated ${code.length} chars of React code in ${Date.now() - start}ms`,
    );

    return {
      stage: 'codegen',
      data: { code },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Painting your UI] Error:', message);
    return {
      stage: 'codegen',
      data: { code: '' },
      durationMs: Date.now() - start,
      error: `Codegen failed: ${message}`,
    };
  }
}
