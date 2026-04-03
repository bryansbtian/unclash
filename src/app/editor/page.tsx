"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEditorStore, useCurrentPage } from "@/store/editorStore";
import { useEditorKeyboard } from "@/hooks/useEditorKeyboard";
import Canvas from "@/components/canvas/Canvas";
import ChatPanel from "@/components/panels/ChatPanel";
import PropertiesPanel from "@/components/panels/PropertiesPanel";
import Toolbar from "@/components/panels/Toolbar";
import ToolsBar from "@/components/panels/ToolsBar";
import CodePreview from "@/components/export/CodePreview";
import { Page } from "@/types/schema";

export default function EditorPage() {
  const router = useRouter();
  const page = useCurrentPage();
  const {
    pages,
    isExportOpen,
    pendingPrompt,
    pendingScreenshots,
    clearPendingInput,
    setPage,
    setPages,
    setOriginalScreenshot,
    setProjectName,
  } = useEditorStore();

  useEditorKeyboard();

  const generationStarted = useRef(false);

  const hasPending =
    pendingPrompt.trim().length > 0 ||
    pendingScreenshots.some((f) => f.size > 0);

  useEffect(() => {
    if (pages.length > 0 && document.title === "Unclash — Screenshot to Wireframe to Code") {
      document.title = "Editor — Unclash";
    }
  }, [pages.length]);

  const startGeneration = useCallback(async () => {
    if (generationStarted.current) return;
    generationStarted.current = true;

    const formData = new FormData();
    for (const file of pendingScreenshots) {
      if (file.size > 0) formData.append("screenshots", file);
    }
    if (pendingPrompt.trim()) formData.append("prompt", pendingPrompt.trim());

    try {
      const res = await fetch("/api/generate", { method: "POST", body: formData });
      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || `Server error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            handleEvent(data);
          } catch { /* skip malformed */ }
        }
      }
      if (buffer.startsWith("data: ")) {
        try {
          handleEvent(JSON.parse(buffer.slice(6)));
        } catch { /* skip */ }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      window.dispatchEvent(
        new CustomEvent("toran:stage", {
          detail: { id: "error", status: "failed", label: "Generation failed", description: message },
        }),
      );
    }

    function handleEvent(data: Record<string, unknown>) {
      if (data.type === "title") {
        const t = (data.title as string) || "New Project";
        document.title = `${t} — Unclash`;
        setProjectName(t);
      } else if (data.type === "stage") {
        window.dispatchEvent(new CustomEvent("toran:stage", { detail: data }));
      } else if (data.type === "complete") {
        const resultPages = data.pages as Page[];
        if (resultPages.length > 1) {
          setPages(resultPages);
        } else if (resultPages.length === 1) {
          setPage(resultPages[0]);
        }
        if (pendingScreenshots.length > 0 && pendingScreenshots[0]?.size > 0) {
          setOriginalScreenshot(URL.createObjectURL(pendingScreenshots[0]));
        }
        clearPendingInput();
        window.dispatchEvent(new CustomEvent("toran:generation-complete"));
      } else if (data.type === "error") {
        window.dispatchEvent(
          new CustomEvent("toran:stage", {
            detail: { id: "error", status: "failed", label: "Error", description: data.message },
          }),
        );
      }
    }
  }, [
    pendingPrompt,
    pendingScreenshots,
    clearPendingInput,
    setPage,
    setPages,
    setOriginalScreenshot,
    setProjectName,
  ]);

  useEffect(() => {
    if (hasPending && !generationStarted.current) {
      startGeneration();
    }
  }, [hasPending, startGeneration]);

  useEffect(() => {
    if (!pages.length && !hasPending && generationStarted.current) {
      router.push("/");
    }
  }, [pages.length, hasPending, router]);

  // Block ALL browser-level zoom
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("gesturestart", onGesture);
    document.addEventListener("gesturechange", onGesture);
    document.addEventListener("gestureend", onGesture);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("gesturestart", onGesture);
      document.removeEventListener("gesturechange", onGesture);
      document.removeEventListener("gestureend", onGesture);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Show loading while waiting for generation
  if (!page && (hasPending || !generationStarted.current)) {
    return (
      <div className="h-screen flex flex-col overflow-hidden" style={{ touchAction: "none" }}>
        <Toolbar />
        <div className="flex-1 flex overflow-hidden">
          <ChatPanel />
          <div className="flex-1 flex items-center justify-center bg-(--bg-primary)">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <PropertiesPanel />
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ touchAction: "none" }}>
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        <ChatPanel />
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
          <div className="flex-1 overflow-auto canvas-grid pb-14">
            <Canvas />
          </div>
        </div>
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <ToolsBar />
        </div>
        <PropertiesPanel />
      </div>
      {isExportOpen && <CodePreview />}
    </div>
  );
}
