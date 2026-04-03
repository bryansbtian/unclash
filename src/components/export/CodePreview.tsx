"use client";

import { useState, useMemo } from "react";
import { useEditorStore } from "@/store/editorStore";
import { generateCode } from "@/services/codeGenerator";
import { exportAsZip, downloadBlob } from "@/services/exportZip";
import { X, Download, FileCode, Copy, Check } from "lucide-react";

export default function CodePreview() {
  const { pages, setExportOpen, projectName } = useEditorStore();
  const [activeFile, setActiveFile] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const files = useMemo(() => {
    return generateCode(pages);
  }, [pages]);

  const fileNames = Object.keys(files);
  const currentActiveFile =
    (activeFile && files[activeFile] ? activeFile : "") ||
    fileNames.find((f) => f.includes("page.tsx")) ||
    fileNames[0] ||
    "";

  const handleDownload = async () => {
    const blob = await exportAsZip(files, projectName || "unclash-export");
    downloadBlob(blob, `${projectName || "unclash-export"}.zip`);
  };

  const handleCopy = async () => {
    if (!currentActiveFile || !files[currentActiveFile]) return;
    await navigator.clipboard.writeText(files[currentActiveFile]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setExportOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-[90vw] max-w-5xl h-[80vh] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl overflow-hidden flex flex-col fade-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold">Generated Code</h2>
            <span className="text-[10px] text-[var(--text-muted)] bg-white/5 px-1.5 py-0.5 rounded">
              {fileNames.length} files
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download ZIP
            </button>
            <button
              onClick={() => setExportOpen(false)}
              className="p-1.5 rounded-md hover:bg-white/5 text-[var(--text-muted)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* File list sidebar */}
          <div className="w-56 border-r border-[var(--border)] overflow-y-auto py-2">
            {fileNames.map((name) => (
              <button
                key={name}
                onClick={() => setActiveFile(name)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                  activeFile === name || (!activeFile && name === currentActiveFile)
                    ? "bg-[var(--accent-muted)] text-indigo-300"
                    : "text-[var(--text-secondary)] hover:bg-white/5"
                }`}
              >
                <FileCode className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{name}</span>
              </button>
            ))}
          </div>

          {/* Code view */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* File path + copy button */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-primary)]">
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                {currentActiveFile}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-[var(--text-muted)] hover:bg-white/5 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-green-400" />
                    <span className="text-green-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>

            {/* Code content */}
            <div className="flex-1 overflow-auto code-preview bg-[var(--bg-primary)]">
              <pre className="p-4 text-[13px] leading-relaxed text-[var(--text-secondary)] font-mono whitespace-pre-wrap">
                {files[currentActiveFile] || ""}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
