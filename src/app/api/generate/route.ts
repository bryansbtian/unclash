import { NextRequest } from 'next/server';
import { Page, CodeNode } from '@/types/schema';
import { generateComponentCode } from '@/services/pipeline/stageF-codegen';
import {
  generateText,
  getAnthropicFastModel,
  getAnthropicModel,
} from '@/services/anthropic';

const MODEL = getAnthropicModel();
const FAST_MODEL = getAnthropicFastModel();

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const files = formData.getAll('screenshots') as File[];
  const prompt = (formData.get('prompt') as string) || '';

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const dataUrls: string[] = [];
        for (const file of files) {
          if (file.size === 0) continue;
          const bytes = await file.arrayBuffer();
          const base64 = Buffer.from(bytes).toString('base64');
          const mimeType = file.type || 'image/png';
          dataUrls.push(`data:${mimeType};base64,${base64}`);
        }

        const hasImages = dataUrls.length > 0;
        const isMulti = dataUrls.length > 1;

        let title = 'New Project';
        if (prompt.trim()) {
          try {
            const titleText = await generateText({
              model: FAST_MODEL,
              system:
                'Summarize the user request in 1-5 words. Output only the summary, with no quotes or trailing punctuation.',
              userContent: [{ type: 'text', text: prompt }],
              maxTokens: 20,
              temperature: 0,
            });
            title = titleText.trim() || 'New Project';
          } catch {
            title = prompt.trim().slice(0, 40);
          }
        } else if (hasImages) {
          title = 'Design Analysis';
        }
        send({ type: 'title', title: toTitleCase(title) });

        send({ type: 'stage', id: 'upload', status: 'complete', label: 'Upload received', description: `${dataUrls.length} file(s)` });

        if (!hasImages && !prompt.trim()) {
          send({ type: 'error', message: 'No screenshots or prompt provided' });
          controller.close();
          return;
        }

        const pages: Page[] = [];

        if (hasImages) {
          // ── Screenshot mode: Stage F first, then parse divs ──────────────
          send({ type: 'stage', id: 'codegen', status: 'pending', label: 'Generating React component' });
          send({ type: 'stage', id: 'parse', status: 'pending', label: 'Separating components' });

          const imageGroups: Array<{ pageId: string; pageName: string; dataUrl: string }> = isMulti
            ? dataUrls.map((url, i) => ({ pageId: `page-${i + 1}`, pageName: `Page ${i + 1}`, dataUrl: url }))
            : [{ pageId: 'page-1', pageName: 'Home', dataUrl: dataUrls[0] }];

          for (const { pageId, pageName, dataUrl } of imageGroups) {
            // Stage F: generate React component
            send({ type: 'stage', id: 'codegen', status: 'running', label: 'Generating React component' });
            const stageFResult = await generateComponentCode(
              dataUrl,
              { width: 1440, height: 900 },
              FAST_MODEL,
            );

            if (stageFResult.error && !stageFResult.data.code) {
              send({ type: 'stage', id: 'codegen', status: 'failed', label: 'Generating React component', description: stageFResult.error });
              send({ type: 'error', message: stageFResult.error });
              controller.close();
              return;
            }

            send({
              type: 'stage',
              id: 'codegen',
              status: 'complete',
              label: 'Generating React component',
              description: `${stageFResult.data.code.length} chars generated`,
            });

            // Stage Parse: extract data-unclash-id elements from the generated JSX
            send({ type: 'stage', id: 'parse', status: 'running', label: 'Separating components' });
            const parsedNodes = parseCodeNodes(stageFResult.data.code);
            send({
              type: 'stage',
              id: 'parse',
              status: 'complete',
              label: 'Separating components',
              description: `${countCodeNodes(parsedNodes)} components found`,
            });

            pages.push({
              id: pageId,
              name: pageName,
              width: 1440,
              height: 900,
              children: [],
              code: stageFResult.data.code,
            });
          }
        } else {
          // ── Prompt-only mode: use A–E pipeline ───────────────────────────
          send({ type: 'stage', id: 'regions', status: 'pending', label: 'Planning layout' });
          send({ type: 'stage', id: 'children', status: 'pending', label: 'Extracting components' });
          send({ type: 'stage', id: 'assemble', status: 'pending', label: 'Building schema' });
          send({ type: 'stage', id: 'validate', status: 'pending', label: 'Validating schema' });
          send({ type: 'stage', id: 'wireframe', status: 'pending', label: 'Generating wireframe' });

          send({ type: 'stage', id: 'regions', status: 'complete', label: 'Planning layout', description: 'Prompt-only mode' });
          send({ type: 'stage', id: 'children', status: 'complete', label: 'Extracting components', description: 'Skipped' });
          send({ type: 'stage', id: 'assemble', status: 'complete', label: 'Building schema', description: 'Skipped' });
          send({ type: 'stage', id: 'validate', status: 'complete', label: 'Validating schema', description: 'Skipped' });
          send({ type: 'stage', id: 'wireframe', status: 'complete', label: 'Generating wireframe', description: 'Empty page' });

          pages.push({
            id: 'page-1',
            name: 'Home',
            width: 1440,
            height: 900,
            children: [],
          });
        }

        send({ type: 'complete', pages });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Generate API] Error:', message);
        send({ type: 'error', message: `Generation failed: ${message}` });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// Parse data-unclash-id elements from JSX string using indentation to infer nesting
function parseCodeNodes(code: string): CodeNode[] {
  const lines = code.split('\n');
  const tagRe = /^(\s*)<(\w+)[^>]*data-unclash-id="([^"]+)"/;

  const root: CodeNode[] = [];
  const stack: Array<{ node: CodeNode; indent: number }> = [];

  for (const line of lines) {
    const match = line.match(tagRe);
    if (!match) continue;

    const indent = match[1].length;
    const tagName = match[2];
    const id = match[3];

    const node: CodeNode = { id, tagName, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, indent });
  }

  return root;
}

function countCodeNodes(nodes: CodeNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countCodeNodes(n.children), 0);
}
