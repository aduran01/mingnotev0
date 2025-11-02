import * as React from "react";
import { useRef, useEffect } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import { saveDoc } from "../../lib/ipc";
import CharacterEditor from "./CharacterEditor";
import WordCounter from "./WordCounter";

/**
 * Editor component with toolbar, autosave and live counters.
 * Inline comments (`// comment //`) are ignored in the counts.
 */
export default function Editor() {
  const s = useSnapshot(state);
  const timer = useRef<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Autosave on interval (unchanged)
  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      if (!s.currentDocId) return;
      await saveDoc(state.projectPath, s.currentDocId, s.editor.md);
      state.editor.lastSaved = Date.now();
    }, 5000) as unknown as number;
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [s.currentDocId, s.editor.md]);

  const onBlur = async () => {
    if (!s.currentDocId) return;
    await saveDoc(state.projectPath, s.currentDocId, s.editor.md);
    state.editor.lastSaved = Date.now();
  };

  // Stop editing if no project or editing a character
  if (!s.projectPath) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: "1.2rem" }}>Open a New Project!</p>
      </div>
    );
  }
  if (s.currentCharId) return <CharacterEditor />;

 // Compute counts, ignoring text between // and // (including newlines)
const { wordCount, charCount } = React.useMemo(() => {
  const text = s.editor.md || "";
  // Remove inline comments enclosed in //...//
  // [\s\S] matches any character, including newlines, non‑greedy
  const stripped = text.replace(/\/\/[\s\S]*?\/\/\s*/g, "");

  // Split on whitespace to count words; .filter(Boolean) removes empty strings
  const words = stripped.trim().split(/\s+/).filter(Boolean);
  const wc = stripped.trim() ? words.length : 0;
  const cc = stripped.length;

  return { wordCount: wc, charCount: cc };
}, [s.editor.md]);

  // Keyboard shortcut to toggle character count
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        state.editor.showCharCount = !state.editor.showCharCount;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Helper to wrap selection for bold/italic (unchanged)
  const wrapSelection = (prefix: string, suffix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = s.editor.md;
    const before = text.slice(0, start);
    const selected = text.slice(start, end);
    const after = text.slice(end);
    state.editor.md = before + prefix + selected + suffix + after;
    requestAnimationFrame(() => {
      if (el) {
        const pos = start + prefix.length + selected.length + suffix.length;
        el.selectionStart = el.selectionEnd = pos;
        el.focus();
      }
    });
  };

  // Toolbar handlers (unchanged)
  const applyBold = () => wrapSelection("**", "**");
  const applyItalic = () => wrapSelection("_", "_");
  const handleFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    state.editor.font = e.target.value;
  };
  const handleLineSpacingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    state.editor.lineHeight = parseFloat(e.target.value);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        maxWidth: "90%",
        margin: "0 auto",
      }}
    >
      {/* … existing toolbar and textarea … */}
      {/* After your existing content, include the counters */}
      <WordCounter count={wordCount} label="Words" anchor="left" />
      {s.editor.showCharCount && (
        <WordCounter count={charCount} label="Characters" anchor="right" />
      )}
    </div>
  );
}
