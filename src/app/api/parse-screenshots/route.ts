import { NextRequest, NextResponse } from 'next/server';
import { Page } from '@/types/schema';
import { detectMultiScreenshotRegions } from '@/services/pipeline/stage1-regions';
import { extractAllRegionChildren } from '@/services/pipeline/stage2-children';
import { assembleSchema } from '@/services/pipeline/stage3-assemble';
import { repairAndValidate } from '@/services/pipeline/stage4-repair';
import { renderToPage } from '@/services/pipeline/stage5-render';
import { getAnthropicModel } from '@/services/anthropic';

const MODEL = getAnthropicModel();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('screenshots') as File[];
    const prompt = formData.get('prompt') as string | null;

    if (!files?.length) {
      return NextResponse.json(
        { error: 'No screenshots provided. Use "screenshots" field for multiple files.' },
        { status: 400 },
      );
    }

    const screenshots = files.slice(0, 10);
    const imageDataUrls: string[] = [];
    for (const file of screenshots) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const mimeType = file.type || 'image/png';
      imageDataUrls.push(`data:${mimeType};base64,${base64}`);
    }

    const multiResult = await detectMultiScreenshotRegions(imageDataUrls, prompt ?? undefined, MODEL);
    if (multiResult.error && multiResult.data.pages.length === 0) {
      return NextResponse.json({ error: multiResult.error }, { status: 422 });
    }

    const pages: Page[] = [];

    for (let i = 0; i < multiResult.data.pages.length; i++) {
      const pd = multiResult.data.pages[i];
      const imageUrl = imageDataUrls[Math.min(i, imageDataUrls.length - 1)];

      const stage2 = await extractAllRegionChildren(imageUrl, pd.stage1.regions, MODEL);
      const stage3 = assembleSchema(pd.stage1, stage2.data);
      const stage4 = repairAndValidate(stage3.data, pd.stage1.viewport.width, pd.stage1.viewport.height);
      const stage5 = renderToPage(stage4.data, pd.pageName, pd.pageId);
      pages.push(stage5.data);
    }

    if (pages.length === 0) {
      return NextResponse.json(
        { error: 'No pages were detected from the screenshots.' },
        { status: 422 },
      );
    }

    return NextResponse.json({
      pages,
      pipeline: { pageCount: pages.length },
    });
  } catch (error: unknown) {
    console.error('Multi-screenshot parse error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `AI parsing failed: ${message}` },
      { status: 500 },
    );
  }
}
