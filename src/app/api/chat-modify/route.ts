import { NextRequest, NextResponse } from 'next/server';
import { normalizeNodes } from '@/services/aiPrompts';
import { CHAT_MODIFY_PROMPT_V2 } from '@/services/pipeline/prompts';
import { Page } from '@/types/schema';
import { generateStructuredObject, generateText, getAnthropicModel, dataUrlToAnthropicBlock } from '@/services/anthropic';
import { PageSchema } from '@/services/wireframeSchemas';

const MODEL = getAnthropicModel();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, currentPage, images } = body as {
      message: string;
      currentPage: Page;
      images?: string[];
    };

    if (!message || !currentPage) {
      return NextResponse.json(
        { error: 'Message and currentPage are required' },
        { status: 400 }
      );
    }

    // Build image blocks from base64 data URLs
    const imageBlocks = (images ?? []).flatMap((dataUrl) => {
      try {
        return [dataUrlToAnthropicBlock(dataUrl)];
      } catch {
        return [];
      }
    });

    // Code-based pages: modify the React code directly instead of the wireframe schema
    if (currentPage.code) {
      const raw = await generateText({
        model: MODEL,
        system: `You are an expert React developer. Modify the provided React component based on the user's request.
RULES:
1. Return ONLY the modified function body starting with \`function App() {\` and ending with \`}\`
2. No imports, no exports, no markdown fences, no explanation
3. Preserve ALL data-unclash-id attributes exactly as they are — do not add, remove, or rename them
4. Use INLINE STYLES ONLY — apply all changes using the \`style={{}}\` prop. Do NOT use Tailwind classes or any class-based styling. Every color, spacing, font size, border, shadow, and layout value must be a JS style object property.
5. For icons, ALWAYS use lucide-react (available as the global \`lucide\` object: e.g. \`const { Home, Search, Settings } = lucide;\`). Never use emojis or text characters as icon substitutes — only use emoji if the component already contains actual emoji content (e.g. 🎉, 👋).
6. If reference images are provided, use them as visual guidance for the modifications.
7. If the existing component uses Tailwind classes, convert the relevant elements to inline styles when modifying them. Leave unmodified elements as-is.`,
        userContent: [
          ...imageBlocks,
          {
            type: 'text',
            text: `Current React component:\n\n${currentPage.code}\n\nUser request: ${message}\n\nReturn the complete modified function App() { ... } body.`,
          },
        ],
        maxTokens: 8000,
        temperature: 0.1,
      });

      const updatedCode = raw
        .replace(/^```[^\n]*\n?/, '')
        .replace(/\s*```\s*$/, '')
        .trim();

      return NextResponse.json({
        page: { ...currentPage, code: updatedCode },
        summary: 'Modified wireframe layout.',
      });
    }

    const updatedPage = await generateStructuredObject({
      model: MODEL,
      system: CHAT_MODIFY_PROMPT_V2,
      userContent: [
        ...imageBlocks,
        {
          type: 'text',
          text: `Here is the current wireframe schema:

${JSON.stringify(currentPage, null, 2)}

User request: ${message}${imageBlocks.length > 0 ? '\n\nReference image(s) attached above — use them as visual guidance.' : ''}

Return the COMPLETE updated wireframe JSON using the provided schema tool.`,
        },
      ],
      schema: PageSchema,
      toolName: 'update_wireframe_page',
      toolDescription:
        'Return the full updated wireframe Page JSON after applying the user request. Preserve unchanged fields and node IDs whenever possible.',
      maxTokens: 4096,
      temperature: 0.3,
    });

    updatedPage.children = normalizeNodes(updatedPage.children || []);
    if (!updatedPage.width) updatedPage.width = currentPage.width;
    if (!updatedPage.height) updatedPage.height = currentPage.height;
    if (!updatedPage.id) updatedPage.id = currentPage.id;

    const oldCount = countNodes(currentPage.children);
    const newCount = countNodes(updatedPage.children);
    let summary = 'Wireframe updated.';
    if (newCount > oldCount) summary = `Added ${newCount - oldCount} element(s).`;
    else if (newCount < oldCount) summary = `Removed ${oldCount - newCount} element(s).`;
    else summary = 'Modified wireframe layout.';

    return NextResponse.json({ page: updatedPage, summary });
  } catch (error: unknown) {
    console.error('Chat modify error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Modification failed: ${message}` }, { status: 500 });
  }
}

function countNodes(nodes: { children?: unknown[] }[]): number {
  let count = 0;
  for (const node of nodes) {
    count++;
    if (node.children && Array.isArray(node.children)) {
      count += countNodes(node.children as { children?: unknown[] }[]);
    }
  }
  return count;
}
