import { NextRequest, NextResponse } from 'next/server';
import { normalizeNodes } from '@/services/aiPrompts';
import { CHAT_MODIFY_PROMPT_V2 } from '@/services/pipeline/prompts';
import { Page } from '@/types/schema';
import { generateStructuredObject, getAnthropicModel } from '@/services/anthropic';
import { PageSchema } from '@/services/wireframeSchemas';

const MODEL = getAnthropicModel();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, currentPage } = body as {
      message: string;
      currentPage: Page;
    };

    if (!message || !currentPage) {
      return NextResponse.json(
        { error: 'Message and currentPage are required' },
        { status: 400 }
      );
    }

    const updatedPage = await generateStructuredObject({
      model: MODEL,
      system: CHAT_MODIFY_PROMPT_V2,
      userContent: [
        {
          type: 'text',
          text: `Here is the current wireframe schema:

${JSON.stringify(currentPage, null, 2)}

User request: ${message}

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
