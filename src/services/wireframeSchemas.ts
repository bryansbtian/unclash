import 'server-only';

import { z } from 'zod';
import { NODE_TYPES } from '@/types/schema';

const NodeTypeSchema = z.enum(NODE_TYPES);

interface WireframeNodeShape {
  id: string;
  type: (typeof NODE_TYPES)[number];
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  children: WireframeNodeShape[];
  styles?: Record<string, string>;
  metadata?: Record<string, unknown>;
  confidence?: number;
}

export const WireframeNodeSchema: z.ZodType<WireframeNodeShape> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: NodeTypeSchema,
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    text: z.string().optional(),
    children: z.array(WireframeNodeSchema),
    styles: z.record(z.string(), z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    confidence: z.number().optional(),
  }),
);

export const PageSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  width: z.number(),
  height: z.number(),
  children: z.array(WireframeNodeSchema),
  canvasX: z.number().optional(),
  canvasY: z.number().optional(),
});
