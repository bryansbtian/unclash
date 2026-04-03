"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Paperclip,
  X,
  ArrowUp,
  Sparkles,
} from "lucide-react";
import { useEditorStore } from "@/store/editorStore";

const IDEA_TEMPLATES = [
  {
    label: "Dashboard",
    prompt:
      "A modern analytics dashboard with sidebar navigation, stat cards, revenue chart, and recent transactions table",
  },
  {
    label: "Landing Page",
    prompt:
      "A SaaS landing page with hero section, feature grid, testimonials, pricing cards, and footer",
  },
  {
    label: "E-commerce",
    prompt:
      "An e-commerce product listing page with top navbar, search bar, filter sidebar, product grid with cards, and pagination",
  },
  {
    label: "Settings Panel",
    prompt:
      "A settings page with sidebar tabs for Profile, Notifications, Security, and Billing sections with forms and toggles",
  },
  {
    label: "Blog",
    prompt:
      "A blog homepage with navbar, featured article hero, article card grid, sidebar with categories and tags",
  },
  {
    label: "Chat App",
    prompt:
      "A messaging app with sidebar conversation list, main chat area with message bubbles, and a message input bar",
  },
];

const MAX_SCREENSHOTS = 5;

export default function HomePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState("");
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  const { setPendingInput } = useEditorStore();

  const addFiles = useCallback(
    (files: File[]) => {
      const valid = files.filter((f) =>
        ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"].includes(f.type),
      );
      if (valid.length === 0) {
        setError("Please upload PNG, JPG, WebP images or PDF files.");
        return;
      }
      for (const f of valid) {
        if (f.size > 10 * 1024 * 1024) {
          setError("Each file must be under 10 MB.");
          return;
        }
      }
      setError(null);

      const remaining = MAX_SCREENSHOTS - screenshots.length;
      const toAdd = valid.slice(0, remaining);
      if (toAdd.length === 0) {
        setError(`Maximum ${MAX_SCREENSHOTS} screenshots allowed.`);
        return;
      }

      const newPreviews: string[] = [];
      for (const f of toAdd) {
        newPreviews.push(URL.createObjectURL(f));
      }

      setScreenshots((prev) => [...prev, ...toAdd]);
      setPreviews((prev) => [...prev, ...newPreviews]);
    },
    [screenshots.length],
  );

  // ── Clipboard paste handler ───────────────────────────────
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [addFiles]);

  // ── Close plus menu on outside click ──────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        plusMenuRef.current &&
        !plusMenuRef.current.contains(e.target as Node)
      ) {
        setShowPlusMenu(false);
      }
    }
    if (showPlusMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showPlusMenu]);

  const removeScreenshot = useCallback((index: number) => {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleGenerate = useCallback(() => {
    if (screenshots.length === 0 && !prompt.trim()) {
      setError(
        "Upload at least one screenshot or describe what you want to build.",
      );
      return;
    }
    setError(null);
    setPendingInput(prompt, screenshots, previews);
    router.push("/editor");
  }, [router, screenshots, previews, prompt, setPendingInput]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) addFiles(files);
    },
    [addFiles],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length) addFiles(files);
      e.target.value = "";
    },
    [addFiles],
  );

  const canGenerate = screenshots.length > 0 || prompt.trim().length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-(--bg-primary) text-(--text-primary)">
      {/* ── Navbar ───────────────────────────────────────── */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-white/5">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Unclash</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-(--text-muted)">
            <span className="hover:text-(--text-primary) cursor-pointer transition-colors">
              Features
            </span>
            <span className="hover:text-(--text-primary) cursor-pointer transition-colors">
              Templates
            </span>
            <span className="hover:text-(--text-primary) cursor-pointer transition-colors">
              Docs
            </span>
          </nav>
        </div>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener"
          className="text-sm text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          GitHub
        </a>
      </header>

      {/* ── Main Content ─────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center px-6 pt-16 pb-24">
        <div className="max-w-2xl w-full text-center fade-in">
          <h1 className="text-4xl md:text-[44px] font-bold tracking-tight mb-4 leading-tight bg-linear-to-b from-white to-gray-400 bg-clip-text text-transparent">
            What will you build next?
          </h1>
          <p className="text-(--text-secondary) text-base md:text-lg mb-10 max-w-lg mx-auto leading-relaxed">
            Upload screenshots of any app or describe your idea below. AI
            creates wireframes and exports React&nbsp;+&nbsp;Tailwind code.
          </p>

          {/* ── Prompt Card ────────────────────────────────── */}
          <div
            ref={cardRef}
            className={`rounded-2xl border transition-all ${
              isDragging
                ? "border-indigo-500/60 shadow-[0_0_24px_rgba(99,102,241,0.15)]"
                : "border-(--border) hover:border-(--border-hover)"
            } bg-(--bg-secondary)`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {/* Textarea */}
            <div className="px-5 pt-5">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the app you want to create..."
                rows={3}
                className="w-full resize-none bg-transparent text-(--text-primary) placeholder-(--text-muted) text-[15px] leading-relaxed outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canGenerate) handleGenerate();
                  }
                }}
              />
            </div>

            {/* Screenshot Previews */}
            {previews.length > 0 && (
              <div className="px-5 pb-2 flex gap-2 flex-wrap">
                {previews.map((src, i) => (
                  <div
                    key={i}
                    className="relative group w-20 h-14 rounded-lg overflow-hidden border border-white/10 bg-(--bg-elevated)"
                  >
                    <img
                      src={src}
                      alt={`Screenshot ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeScreenshot(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {screenshots.length < MAX_SCREENSHOTS && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-14 rounded-lg border-2 border-dashed border-white/10 hover:border-indigo-500/50 flex items-center justify-center text-(--text-muted) hover:text-indigo-400 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}

            {/* Bottom Bar */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-white/5">
              <div className="relative" ref={plusMenuRef}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => setShowPlusMenu((v) => !v)}
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-white/10 text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {showPlusMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-52 rounded-xl bg-(--bg-elevated) border border-white/10 shadow-2xl py-1.5 z-50">
                    <button
                      onClick={() => {
                        setShowPlusMenu(false);
                        fileInputRef.current?.click();
                      }}
                      disabled={screenshots.length >= MAX_SCREENSHOTS}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-(--text-secondary) hover:text-(--text-primary) hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Paperclip className="w-4 h-4" />
                      Add photos &amp; files
                      {screenshots.length > 0 && (
                        <span className="ml-auto text-xs text-(--text-muted)">
                          {screenshots.length}/{MAX_SCREENSHOTS}
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleGenerate()}
                disabled={!canGenerate}
                className="w-9 h-9 flex items-center justify-center rounded-full text-white bg-indigo-600 hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-400 fade-in">{error}</p>
          )}

          {/* ── Ideas ──────────────────────────────────────── */}
          <div className="mt-10">
            <div className="mb-4">
              <span className="text-sm text-(--text-muted)">
                Ideas to get started:
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {IDEA_TEMPLATES.map((idea) => (
                <button
                  key={idea.label}
                  onClick={() => setPrompt(idea.prompt)}
                  className="px-4 py-2 rounded-full text-sm border border-(--border) text-(--text-secondary) bg-(--bg-secondary) hover:border-indigo-500/40 hover:text-indigo-400 hover:bg-indigo-500/5 transition-all"
                >
                  {idea.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="py-6 text-center text-xs text-(--text-muted) border-t border-white/5">
        Built with Next.js, React, and Tailwind CSS
      </footer>
    </div>
  );
}
