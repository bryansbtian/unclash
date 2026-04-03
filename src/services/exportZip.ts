import JSZip from 'jszip';

/**
 * Bundle generated code files into a downloadable zip.
 */
export async function exportAsZip(
  files: Record<string, string>,
  projectName: string = 'unclash-export'
): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(projectName)!;

  for (const [path, content] of Object.entries(files)) {
    folder.file(path, content);
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Trigger browser download for a blob.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
