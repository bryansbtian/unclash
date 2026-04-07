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

/**
 * Detects and repairs truncated JSX code — closes any open strings,
 * removes incomplete last lines, and balances curly braces so the
 * function body always ends with a valid closing `}`.
 */
function repairTruncatedCode(code: string): string {
  let trimmed = code.trimEnd();
  if (trimmed.endsWith('}')) return code; // looks complete

  const lines = trimmed.split('\n');

  // Drop the last line if it's clearly incomplete (no safe ending character)
  // Safe endings: >, ;, {, }, comma, or closing paren on its own
  let lastSafe = lines.length - 1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trimEnd();
    if (l.endsWith('>') || l.endsWith(';') || l.endsWith('{') || l.endsWith('}') || l.endsWith(',') || l.endsWith('(')) {
      lastSafe = i;
      break;
    }
  }
  trimmed = lines.slice(0, lastSafe + 1).join('\n');

  // Count unbalanced braces (outside strings/template literals)
  let braceDepth = 0;
  let inStr: string | null = null;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
      else if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
    }
  }

  // Close all open braces
  if (braceDepth > 0) {
    trimmed += '\n' + '}'.repeat(braceDepth);
  }

  return trimmed;
}

export async function generateComponentCode(
  imageDataUrl: string,
  viewport: { width: number; height: number },
  model: string,
  screenFocus?: { index: number; total: number; name: string; position: string },
): Promise<StageResult<{ code: string }>> {
  const start = Date.now();

  try {
    const screenInstruction = screenFocus && screenFocus.total > 1
      ? ` IMPORTANT: This image contains ${screenFocus.total} distinct screens side-by-side. Generate code ONLY for the "${screenFocus.name}" screen (the ${screenFocus.position} one, screen ${screenFocus.index + 1} of ${screenFocus.total}). Completely ignore all other screens in the image.`
      : '';

    const raw = await generateText({
      model,
      system: CODE_GEN_PROMPT,
      userContent: [
        dataUrlToAnthropicBlock(imageDataUrl),
        {
          type: 'text',
          text: `Recreate this UI as a React App component. Viewport: ${viewport.width}×${viewport.height}px. Every div/section/nav/header/main/aside/footer must have data-unclash-id. Output only the function body starting with \`function App() {\`. Keep the code concise — avoid unnecessary comments or repetition. IMPORTANT: Do NOT add a device frame, phone shell, or mockup wrapper — the artboard IS the device, so fill the full ${viewport.width}×${viewport.height}px viewport directly.${screenInstruction}`,
        },
      ],
      maxTokens: 4500,
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

    // Repair truncated code (e.g. cut off mid-string due to token limits)
    code = repairTruncatedCode(code);

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
