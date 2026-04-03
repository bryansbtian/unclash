import { NextRequest, NextResponse } from 'next/server';
import { detectTopLevelRegions } from '@/services/pipeline/stageA-regions';
import { extractAllRegionChildren } from '@/services/pipeline/stageB-children';
import { assembleSchema } from '@/services/pipeline/stageC-assemble';
import { repairAndValidate } from '@/services/pipeline/stageD-repair';
import { renderToPage } from '@/services/pipeline/stageE-render';
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

    const stageA = await detectTopLevelRegions(dataUrl, prompt ?? undefined, MODEL);
    if (stageA.error && stageA.data.regions.length === 0) {
      return NextResponse.json({ error: stageA.error }, { status: 422 });
    }

    const stageB = await extractAllRegionChildren(dataUrl, stageA.data.regions, MODEL);
    const stageC = assembleSchema(stageA.data, stageB.data);
    const stageD = repairAndValidate(stageC.data, stageA.data.viewport.width, stageA.data.viewport.height);
    const stageE = renderToPage(stageD.data, 'Home', 'page-1');

    return NextResponse.json({
      page: stageE.data,
      pipeline: {
        success: !stageE.error,
        totalDurationMs: stageA.durationMs + stageB.durationMs + stageC.durationMs + stageD.durationMs + stageE.durationMs,
        warnings: stageD.data.warnings,
        stats: stageD.data.stats,
      },
    });
  } catch (error: unknown) {
    console.error('Screenshot parse error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `AI parsing failed: ${message}` }, { status: 500 });
  }
}
