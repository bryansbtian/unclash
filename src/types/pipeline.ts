import { z } from 'zod';

// ── Expanded UI Node Types ──────────────────────────────────

export const UI_NODE_TYPES = [
  // Page-level
  'page',
  'app-shell',

  // Top-level regions
  'header',
  'topbar',
  'hero',
  'sidebar',
  'main-content',
  'right-panel',
  'footer',
  'modal-overlay',
  'section',

  // Layout containers
  'container',
  'hero-content',
  'feature-grid',
  'card-grid',
  'CTA-group',

  // Cards
  'card',
  'stat-card',
  'promo-card',
  'product-card',
  'pricing-card',
  'testimonial-card',
  'metric-tile',

  // Data
  'table',
  'chart',
  'list',

  // Navigation
  'nav-group',
  'nav-item',
  'navbar-link',
  'filter-chip-row',
  'chip',

  // Controls
  'button',
  'icon-button',
  'input',
  'search-input',
  'form',
  'form-row',
  'slider',
  'badge',
  'avatar',
  'logo',
  'dropdown',
  'toggle',
  'tabs',
  'tab-item',

  // Content
  'text',
  'label',
  'image-placeholder',
  'divider',
] as const;

export type UINodeType = (typeof UI_NODE_TYPES)[number];

// ── Zod Schemas ─────────────────────────────────────────────
// Stage 1 and 2 schemas are shared between Anthropic tool schemas and local validation.
// Nullable fields keep the model output shape explicit and predictable.

export const BoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export type Bounds = z.infer<typeof BoundsSchema>;

export const UINodeTypeSchema = z.enum(UI_NODE_TYPES);

export const UINodeSchema: z.ZodType<UINodeZod> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: UINodeTypeSchema,
    role: z.string().nullable(),
    label: z.string().nullable(),
    bounds: BoundsSchema,
    text: z.string().nullable(),
    children: z.array(UINodeSchema),
    parentId: z.string().nullable(),
    layoutDirection: z.enum(['row', 'column', 'grid', 'unknown']).nullable(),
    isRepeated: z.boolean().nullable(),
    repeatCount: z.number().nullable(),
    styleHints: z.array(z.string()).nullable(),
    confidence: z.number(),
    warnings: z.array(z.string()).nullable(),
  }),
);

interface UINodeZod {
  id: string;
  type: UINodeType;
  role: string | null;
  label: string | null;
  bounds: Bounds;
  text: string | null;
  children: UINodeZod[];
  parentId: string | null;
  layoutDirection: 'row' | 'column' | 'grid' | 'unknown' | null;
  isRepeated: boolean | null;
  repeatCount: number | null;
  styleHints: string[] | null;
  confidence: number;
  warnings: string[] | null;
}

export interface UINode {
  id: string;
  type: UINodeType;
  role?: string;
  label?: string;
  bounds: Bounds;
  text?: string;
  children: UINode[];
  parentId?: string | null;
  layoutDirection?: 'row' | 'column' | 'grid' | 'unknown';
  isRepeated?: boolean;
  repeatCount?: number;
  styleHints?: string[];
  confidence: number;
  warnings?: string[];
}

// ── Stage 1: Top-Level Region Output ────────────────────────

export const TopLevelRegionSchema = z.object({
  id: z.string(),
  type: UINodeTypeSchema,
  label: z.string().nullable(),
  bounds: BoundsSchema,
  confidence: z.number(),
});

export type TopLevelRegion = {
  id: string;
  type: UINodeType;
  label?: string | null;
  bounds: Bounds;
  confidence: number;
};

export const Stage1OutputSchema = z.object({
  viewport: z.object({ width: z.number(), height: z.number() }),
  regions: z.array(TopLevelRegionSchema),
});

export type Stage1Output = {
  viewport: { width: number; height: number };
  regions: TopLevelRegion[];
};

// ── Stage 2: Region Children Output ─────────────────────────

export const RegionChildSchema: z.ZodType<RegionChildZod> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: UINodeTypeSchema,
    label: z.string().nullable(),
    bounds: BoundsSchema,
    text: z.string().nullable(),
    layoutDirection: z.enum(['row', 'column', 'grid', 'unknown']).nullable(),
    isRepeated: z.boolean().nullable(),
    repeatCount: z.number().nullable(),
    styleHints: z.array(z.string()).nullable(),
    confidence: z.number(),
    children: z.array(RegionChildSchema),
  }),
);

interface RegionChildZod {
  id: string;
  type: UINodeType;
  label: string | null;
  bounds: Bounds;
  text: string | null;
  layoutDirection: 'row' | 'column' | 'grid' | 'unknown' | null;
  isRepeated: boolean | null;
  repeatCount: number | null;
  styleHints: string[] | null;
  confidence: number;
  children: RegionChildZod[];
}

export interface RegionChild {
  id: string;
  type: UINodeType;
  label?: string | null;
  bounds: Bounds;
  text?: string | null;
  layoutDirection?: 'row' | 'column' | 'grid' | 'unknown' | null;
  isRepeated?: boolean | null;
  repeatCount?: number | null;
  styleHints?: string[] | null;
  confidence: number;
  children: RegionChild[];
}

export const Stage2OutputSchema = z.object({
  regionId: z.string(),
  children: z.array(RegionChildSchema),
});

export type Stage2Output = {
  regionId: string;
  children: RegionChild[];
};

// ── Validated UI Schema (output of Stage 4) ─────────────────

export interface ValidatedUISchema {
  root: UINode;
  warnings: SchemaWarning[];
  pageWidth: number;
  pageHeight: number;
  stats: {
    totalNodes: number;
    maxDepth: number;
    typeCounts: Record<string, number>;
  };
}

export interface SchemaWarning {
  nodeId: string;
  rule: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  autoFixed: boolean;
}

// ── Pipeline Progress ───────────────────────────────────────

export type PipelineStageStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface PipelineStage {
  id: string;
  label: string;
  description?: string;
  status: PipelineStageStatus;
  startedAt?: string;
  completedAt?: string;
  meta?: Record<string, unknown>;
  error?: string;
}

export interface PipelineProgress {
  requestId: string;
  stages: PipelineStage[];
  currentStageId?: string;
  overallStatus: 'idle' | 'running' | 'complete' | 'failed';
}

// ── Stage Result (internal pipeline tracking) ───────────────

export interface StageResult<T> {
  stage: string;
  data: T;
  durationMs: number;
  error?: string;
}
