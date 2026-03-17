"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface TextReaderProps {
  bookUrl: string;
  isMarkdown?: boolean;
  preferences: {
    theme: string;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    columns: number;
  };
  onProgress?: (progress: number) => void;
}

const themeMap: Record<string, { bg: string; text: string }> = {
  light: { bg: "#ffffff", text: "#111111" },
  dark: { bg: "#111111", text: "#f5f5f5" },
  sepia: { bg: "#f4ecd8", text: "#5b4636" },
  nord: { bg: "#2e3440", text: "#d8dee9" },
};

export function TextReader({
  bookUrl,
  isMarkdown,
  preferences,
  onProgress,
}: TextReaderProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setError("");
      try {
        const res = await fetch(bookUrl);
        if (!res.ok) throw new Error("Failed to load text content");
        const text = await res.text();
        if (mounted) setContent(text);
      } catch (e) {
        if (mounted)
          setError(e instanceof Error ? e.message : "Failed to load");
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [bookUrl]);

  const theme = themeMap[preferences.theme] ?? themeMap.light;
  const fontFamily = useMemo(() => {
    switch (preferences.fontFamily) {
      case "sans":
        return "Inter, Helvetica, Arial, sans-serif";
      case "mono":
        return "JetBrains Mono, Menlo, monospace";
      case "dyslexic":
        return "OpenDyslexic, Inter, sans-serif";
      default:
        return "Georgia, 'Times New Roman', serif";
    }
  }, [preferences.fontFamily]);

  return (
    <div
      className="h-full w-full overflow-auto"
      style={{ background: theme.bg, color: theme.text }}
    >
      {error ? (
        <div className="p-6 text-sm text-red-500">{error}</div>
      ) : (
        <div
          className="mx-auto max-w-4xl p-6"
          style={{
            fontFamily,
            fontSize: `${preferences.fontSize}px`,
            lineHeight: preferences.lineHeight,
            columnCount: preferences.columns,
            columnGap: "2rem",
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            const max = el.scrollHeight - el.clientHeight;
            const progress = max > 0 ? (el.scrollTop / max) * 100 : 0;
            onProgress?.(progress);
          }}
        >
          {isMarkdown ? (
            <article className="prose prose-neutral max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </article>
          ) : (
            <pre className="whitespace-pre-wrap break-words">{content}</pre>
          )}
        </div>
      )}
    </div>
  );
}
