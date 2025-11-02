import * as React from "react";
import { useRef, useEffect } from "react";
import { marked } from "marked";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import { saveDoc } from "../../lib/ipc";
import CharacterEditor from "./CharacterEditor";
import WordCounter from "./WordCounter";

export default function Editor() {
  const s = useSnapshot(state);
  const timerRef = useRef<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Autosave every 5 seconds.  Runs once and refers to latest state via the proxy.
  useEffect(() => {
    timerRef.current = window.setInterval(async () => {
      if (!state.currentDocId) return;
      await saveDoc(state.projectPath, state.currentDocId, state.editor.md);
      state.editor.lastSaved = Date.now();
    }, 5000) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  // Toggle the character counter via Ctrl/⌘+Shift+C (runs once)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        state.editor.showCharCount = !state.editor.showCharCount;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Compute word/character counts ignoring anything between //...//
  const { wordCount, charCount } = React.useMemo(() => {
    const text = s.editor.md || "";
    const stripped = text.replace(/\/\/[\s\S]*?\/\/\s*/g, "");
    const words = stripped.trim().split(/\s+/).filter(Boolean);
    const wc = stripped.trim() ? words.length : 0;
    const cc = stripped.length;
    return { wordCount: wc, charCount: cc };
  }, [s.editor.md]);

  // Preprocess markdown to style inline comments, then convert to HTML
  const renderedHtml = React.useMemo(() => {
    const raw = s.editor.md || "";
    const processed = raw.replace(/\/\/([\s\S]*?)\/\/\s*/g, (_, inner) => {
      const content = String(inner).trim();
      return `<span style="background:#fce7f3; padding:2px 4px; border-radius:4px; font-weight:bold;">${content}</span>`;
    });
    try {
      return marked.parse(processed);
    } catch {
      return `<pre>${processed}</pre>`;
    }
  }, [s.editor.md]);

  // Text selection helper for bold/italic buttons
  const wrapSelection = (prefix: string, suffix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = state.editor.md;
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

  const applyBold = () => wrapSelection("**", "**");
  const applyItalic = () => wrapSelection("_", "_");
  const handleFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    state.editor.font = e.target.value;
  };
  const handleLineSpacingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    state.editor.lineHeight = parseFloat(e.target.value);
  };

  const onBlur = async () => {
    if (!state.currentDocId) return;
    await saveDoc(state.projectPath, state.currentDocId, state.editor.md);
    state.editor.lastSaved = Date.now();
  };

  // Decide what to render after all hooks are called
  const noProject = !s.projectPath;
  const editingCharacter = !!s.currentCharId;

  if (noProject) {
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

  if (editingCharacter) {
    return <CharacterEditor />;
  }

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
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <button
          onClick={applyBold}
          title="Bold"
          style={{
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          B
        </button>
        <button
          onClick={applyItalic}
          title="Italic"
          style={{
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            cursor: "pointer",
            fontStyle: "italic",
          }}
        >
          I
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Font:
          <select value={s.editor.font} onChange={handleFontChange}>
            {["Arial", "Georgia", "Courier New", "Times New Roman"].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Line spacing:
          <select
            value={String(s.editor.lineHeight)}
            onChange={handleLineSpacingChange}
          >
            {["1.2", "1.4", "1.6", "2.0"].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Editor area: textarea and preview side by side */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flex: 1,
          height: "100%",
          overflow: "hidden",
        }}
      >
        <textarea
          ref={textareaRef}
          value={s.editor.md}
          onChange={(e) => (state.editor.md = e.target.value)}
          onBlur={onBlur}
          style={{
            flex: 1,
            height: "100%",
            padding: 12,
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontFamily: s.editor.font,
            lineHeight: s.editor.lineHeight,
            resize: "none",
            overflowY: "auto",
            background: "var(--color-surface)",
            color: "inherit",
          }}
          aria-label="Document editor"
        />
        <div
          style={{
            flex: 1,
            height: "100%",
            overflowY: "auto",
            padding: 12,
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: "var(--color-surface)",
          }}
          aria-label="Markdown preview"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>

      {/* Counters */}
      <WordCounter count={wordCount} label="Words" anchor="left" />
      {s.editor.showCharCount && (
        <WordCounter count={charCount} label="Characters" anchor="right" />
      )}
    </div>
  );
}
