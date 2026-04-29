import { NextRequest, NextResponse } from 'next/server';
import { detectTopLevelRegions } from '@/services/pipeline/stage1-regions';
import { extractAllRegionChildren } from '@/services/pipeline/stage2-children';
import { assembleSchema } from '@/services/pipeline/stage3-assemble';
import { repairAndValidate } from '@/services/pipeline/stage4-repair';
import { renderToPage } from '@/services/pipeline/stage5-render';
import { getAnthropicModel } from '@/services/anthropic';

const MODEL = getAnthropicModel();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('screenshot') as File | null;
    const prompt = formData.get('prompt') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No screenshot provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mimeType = file.type || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const stage1 = await detectTopLevelRegions(dataUrl, prompt ?? undefined, MODEL);
    if (stage1.error && stage1.data.regions.length === 0) {
      return NextResponse.json({ error: stage1.error }, { status: 422 });
    }

    const stage2 = await extractAllRegionChildren(dataUrl, stage1.data.regions, MODEL);
    const stage3 = assembleSchema(stage1.data, stage2.data);
    const stage4 = repairAndValidate(stage3.data, stage1.data.viewport.width, stage1.data.viewport.height);
    const stage5 = renderToPage(stage4.data, 'Home', 'page-1');

    return NextResponse.json({
      page: stage5.data,
      pipeline: {
        success: !stage5.error,
        totalDurationMs: stage1.durationMs + stage2.durationMs + stage3.durationMs + stage4.durationMs + stage5.durationMs,
        warnings: stage4.data.warnings,
        stats: stage4.data.stats,
      },
    });
  } catch (error: unknown) {
    console.error('Screenshot parse error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `AI parsing failed: ${message}` }, { status: 500 });
  }
}
