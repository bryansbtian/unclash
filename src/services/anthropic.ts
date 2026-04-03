import 'server-only';

import { z } from 'zod';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-6';
export const DEFAULT_ANTHROPIC_FAST_MODEL = 'claude-haiku-4-5-20251001';

type AnthropicInputBlock =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      source: {
        type: 'base64';
        media_type: string;
        data: string;
      };
    }
  | {
      type: 'document';
      source: {
        type: 'base64';
        media_type: 'application/pdf';
        data: string;
      };
    };

type AnthropicResponseBlock =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: unknown;
    }
  | {
      type: string;
      [key: string]: unknown;
    };

interface AnthropicMessageResponse {
  content: AnthropicResponseBlock[];
  stop_reason?: string | null;
}

interface AnthropicErrorResponse {
  error?: {
    message?: string;
    type?: string;
  };
}

interface GenerateStructuredObjectOptions<T extends z.ZodTypeAny> {
  model: string;
  system: string;
  userContent: AnthropicInputBlock[];
  schema: T;
  toolName: string;
  toolDescription: string;
  maxTokens: number;
  temperature?: number;
}

interface GenerateTextOptions {
  model: string;
  system: string;
  userContent: AnthropicInputBlock[];
  maxTokens: number;
  temperature?: number;
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

export function getAnthropicFastModel(): string {
  return process.env.ANTHROPIC_FAST_MODEL?.trim() || DEFAULT_ANTHROPIC_FAST_MODEL;
}

function shouldUseStrictTools(): boolean {
  return process.env.ANTHROPIC_STRICT_TOOLS?.trim().toLowerCase() === 'true';
}

export function dataUrlToAnthropicBlock(dataUrl: string): AnthropicInputBlock {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) {
    throw new Error('Invalid data URL supplied to Anthropic request');
  }

  const [, mediaType, rawBase64] = match;
  const data = rawBase64.replace(/\s+/g, '');

  if (mediaType === 'application/pdf') {
    return {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data,
      },
    };
  }

  if (!mediaType.startsWith('image/')) {
    throw new Error(`Unsupported media type for Anthropic request: ${mediaType}`);
  }

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data,
    },
  };
}

export async function generateStructuredObject<T extends z.ZodTypeAny>({
  model,
  system,
  userContent,
  schema,
  toolName,
  toolDescription,
  maxTokens,
  temperature = 0,
}: GenerateStructuredObjectOptions<T>): Promise<z.infer<T>> {
  const response = await createMessage({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    tools: [
      {
        name: toolName,
        description: toolDescription,
        ...(shouldUseStrictTools() ? { strict: true } : {}),
        input_schema: z.toJSONSchema(schema, { target: 'draft-7' }),
      },
    ],
    tool_choice: {
      type: 'tool',
      name: toolName,
    },
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  const toolCall = response.content.find(
    (block): block is Extract<AnthropicResponseBlock, { type: 'tool_use' }> =>
      block.type === 'tool_use' && block.name === toolName,
  );

  if (!toolCall) {
    const text = extractTextFromResponse(response.content);
    const suffix = text ? `: ${text}` : '';
    throw new Error(`Anthropic did not return the expected "${toolName}" output${suffix}`);
  }

  const parsed = schema.safeParse(toolCall.input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Anthropic returned invalid "${toolName}" data: ${details}`);
  }

  return parsed.data;
}

export async function generateText({
  model,
  system,
  userContent,
  maxTokens,
  temperature = 0,
}: GenerateTextOptions): Promise<string> {
  const response = await createMessage({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  const text = extractTextFromResponse(response.content);
  if (!text) {
    throw new Error('Anthropic did not return any text content');
  }

  return text;
}

async function createMessage(body: Record<string, unknown>): Promise<AnthropicMessageResponse> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'x-api-key': getAnthropicApiKey(),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const json = (await response.json().catch(() => null)) as AnthropicMessageResponse | AnthropicErrorResponse | null;

  if (!response.ok) {
    const message =
      json &&
      typeof json === 'object' &&
      'error' in json &&
      typeof json.error?.message === 'string'
        ? json.error.message
        : `Anthropic request failed with status ${response.status}`;

    throw new Error(message);
  }

  return json as AnthropicMessageResponse;
}

function extractTextFromResponse(content: AnthropicResponseBlock[]): string {
  return content
    .filter((block): block is Extract<AnthropicResponseBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function getAnthropicApiKey(): string {
  const apiKey = process.env.ANTHROPIC_SECRET_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_SECRET_KEY (or ANTHROPIC_API_KEY)');
  }

  return apiKey;
}
