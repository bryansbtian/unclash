"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useEditorStore, useCurrentPage } from "@/store/editorStore";
import { Page } from "@/types/schema";
import {
  CheckCircle2,
  Send,
  Sparkles,
  Info,
  ExternalLink,
  Loader2,
  AlertCircle,
  User,
  Circle,
  Clock,
} from "lucide-react";

interface ChatMessage {
  id: string;
  type: "system" | "user" | "ai" | "error" | "stage";
  text: string;
  detail?: string;
  timestamp: string;
  stageStatus?: "pending" | "running" | "complete" | "failed";
}

function formatTime(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

let messageCounter = 0;
function nextId(): string {
  return `msg-${++messageCounter}`;
}

export default function ChatPanel() {
  const { projectName, replaceCurrentPage, pendingPrompt, pendingPreviews } =
    useEditorStore();
  const page = useCurrentPage();
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generationDone, setGenerationDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initial: ChatMessage[] = [];

    if (pendingPrompt.trim()) {
      initial.push({
        id: nextId(),
        type: "user",
        text: pendingPrompt.trim(),
        timestamp: formatTime(),
      });
    }

    if (!pendingPrompt.trim() && pendingPreviews.length === 0 && page) {
      initial.push({
        id: nextId(),
        type: "system",
        text: "Wireframe loaded",
        timestamp: formatTime(),
      });
      addDetectionMessages(initial, page);
      setGenerationDone(true);
    }

    setMessages(initial);
  }, [pendingPrompt, pendingPreviews, page]);

  useEffect(() => {
    function onStage(e: Event) {
      const {
        id,
        status,
        label,
        description,
        detail,
      } = (e as CustomEvent).detail;
      const desc = description || detail;

      setMessages((prev) => {
        const stageId = `stage-${id}`;
        const existingIdx = prev.findIndex(
          (m) => m.type === "stage" && m.id === stageId,
        );
        const updated: ChatMessage = {
          id: stageId,
          type: "stage",
          text: label,
          detail: desc,
          timestamp: formatTime(),
          stageStatus: status,
        };
        if (existingIdx >= 0) {
          return prev.map((m, i) => (i === existingIdx ? updated : m));
        }
        return [...prev, updated];
      });
    }

    function onComplete() {
      setGenerationDone(true);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          type: "system",
          text: "Wireframe ready",
          timestamp: formatTime(),
        },
      ]);
    }

    window.addEventListener("toran:stage", onStage);
    window.addEventListener("toran:generation-complete", onComplete);
    return () => {
      window.removeEventListener("toran:stage", onStage);
      window.removeEventListener("toran:generation-complete", onComplete);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || !page || isLoading) return;

    setInputValue("");
    setMessages((prev) => [
      ...prev,
      { id: nextId(), type: "user", text, timestamp: formatTime() },
    ]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat-modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, currentPage: page }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to modify wireframe");
      }
      const data = await res.json();
      replaceCurrentPage(data.page as Page);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          type: "ai",
          text: (data.summary as string) || "Wireframe updated.",
          detail: `Applied: "${text}"`,
          timestamp: formatTime(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          type: "error",
          text: err instanceof Error ? err.message : "Unknown error",
          timestamp: formatTime(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, page, isLoading, replaceCurrentPage]);

  function stageIcon(status?: string) {
    switch (status) {
      case "complete":
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case "running":
        return <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case "pending":
        return <Circle className="w-3.5 h-3.5 text-(--text-muted) ml-0.5" />;
      default:
        return <Clock className="w-4 h-4 text-(--text-muted)" />;
    }
  }

  return (
    <div className="w-80 bg-(--bg-secondary) border-r border-(--border) flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-(--border)">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-5 h-5 rounded-md bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-semibold text-(--text-primary)">
            Unclash AI
          </span>
        </div>
        <p className="text-[10px] text-(--text-muted) ml-7">{projectName}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1">
        {/* Pending screenshots */}
        {pendingPreviews.length > 0 && (
          <div className="flex gap-1.5 flex-wrap px-2 pb-2">
            {pendingPreviews.map((src, i) => (
              <div
                key={i}
                className="w-14 h-10 rounded-md overflow-hidden border border-slate-200 bg-slate-50"
              >
                <img
                  src={src}
                  alt={`Ref ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.type === "system" ? (
              <div className="flex items-center gap-2 px-2 py-1.5 mt-1">
                <div className="w-1 h-1 rounded-full bg-(--text-muted)" />
                <span className="text-[10px] text-(--text-muted) uppercase tracking-wider font-medium">
                  {msg.text} · {msg.timestamp}
                </span>
              </div>
            ) : msg.type === "user" ? (
              <div className="flex items-start gap-2.5 px-2 py-2 ml-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <User className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-indigo-700 leading-relaxed whitespace-pre-wrap">
                    {msg.text}
                  </p>
                  <p className="text-[9px] text-indigo-400 mt-0.5">
                    {msg.timestamp}
                  </p>
                </div>
              </div>
            ) : msg.type === "stage" ? (
              <div
                className={`flex items-start gap-2.5 px-2 py-1 transition-opacity ${
                  msg.stageStatus === "pending" ? "opacity-40" : "opacity-100"
                }`}
              >
                <div className="mt-0.5 shrink-0">{stageIcon(msg.stageStatus)}</div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs font-medium leading-relaxed ${
                      msg.stageStatus === "failed"
                        ? "text-red-400"
                        : msg.stageStatus === "pending"
                          ? "text-(--text-muted)"
                          : "text-(--text-primary)"
                    }`}
                  >
                    {msg.text}
                  </p>
                  {msg.detail && msg.stageStatus !== "pending" && (
                    <p className="text-[10px] text-(--text-muted) mt-0.5">
                      {msg.detail}
                    </p>
                  )}
                </div>
              </div>
            ) : msg.type === "error" ? (
              <div className="flex items-start gap-2.5 px-2 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-red-600 leading-relaxed">
                    {msg.text}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-(--text-primary) leading-relaxed">
                    {msg.text}
                  </p>
                  {msg.detail && (
                    <p className="text-[10px] text-(--text-muted) mt-0.5">
                      {msg.detail}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
            <p className="text-xs text-(--text-muted)">Updating wireframe...</p>
          </div>
        )}

        {generationDone && messages.length <= 15 && !isLoading && (
          <div className="mt-2 mx-1 p-3 rounded-xl bg-(--bg-elevated) border border-(--border)">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-(--text-primary) mb-1">
                  Wireframe Ready
                </p>
                <p className="text-[10px] text-(--text-muted) leading-relaxed">
                  Edit blocks on the canvas or type below to ask AI to make
                  changes.
                </p>
                <p className="text-[10px] text-(--text-muted) leading-relaxed mt-1">
                  Try: &quot;Add a search bar&quot;, &quot;Make the sidebar
                  wider&quot;, &quot;Remove the chart&quot;
                </p>
              </div>
            </div>
            <a
              href="#"
              className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-600 mt-2 ml-6 transition-colors"
            >
              For more info, visit our Docs{" "}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-1">
        <div className="flex items-center gap-2 bg-(--bg-elevated) border border-(--border) rounded-xl px-3 py-2.5 focus-within:border-indigo-500/50 transition-colors">
          <input
            type="text"
            placeholder="What would you like to change?"
            className="flex-1 bg-transparent text-xs text-(--text-primary) placeholder-(--text-muted) outline-none"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading || !generationDone}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading || !generationDone}
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function addDetectionMessages(messages: ChatMessage[], page: Page) {
  const types = new Set(page.children.map((n) => n.type));
  const typeLabels: Record<string, string> = {
    sidebar: "Detected sidebar navigation",
    navbar: "Detected top navigation bar",
    card: `Detected ${page.children.filter((n) => n.type === "card").length} card(s)`,
    chart: "Detected chart area",
    table: "Detected data table",
    container: "Detected layout sections",
  };
  for (const type of types) {
    if (typeLabels[type]) {
      messages.push({
        id: nextId(),
        type: "ai",
        text: typeLabels[type],
        detail: `${type.charAt(0).toUpperCase() + type.slice(1)} component`,
        timestamp: formatTime(),
      });
    }
  }
}
