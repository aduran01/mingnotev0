import * as React from "react";
import { useRef, useEffect } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import { saveDoc } from "../../lib/ipc";
import CharacterEditor from "./CharacterEditor";
import WordCounter from "./WordCounter";
import MarkdownPreview from "./MarkdownPreview";

/**
 * Editor
 *
 * This component provides a text editor for Markdown documents along with
 * formatting controls, live word/character counts and inline comments.
 * Inline comments are delimited by `// comment //` and are removed
 * from the word/character counts.  They are rendered in the preview
 * with a distinct style via the MarkdownPreview component.
 *
 * Formatting buttons wrap the currently selected text in Markdown
 * markup (or inline HTML for features not supported directly by
 * Markdown such as underline, custom fonts, sizes and colours).  If
 * no text is selected, clicking a formatting button does nothing.
 */
export default function Editor() {
  const s = useSnapshot(state);
  const timerRef = useRef<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Autosave every 5 seconds
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

  // Keyboard shortcut to toggle character count (Ctrl/⌘+Shift+C)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        state.editor.showCharCount = !state.editor.showCharCount;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Compute word and character counts, stripping out inline comments
  const { wordCount, charCount } = React.useMemo(() => {
    const text = s.editor.md || "";
    // Remove //comment// segments from counts
    const stripped = text.replace(/\/\/[^\n]*?\/\//gs, "");
    const words = stripped.trim().split(/\s+/).filter(Boolean);
    const wc = stripped.trim() ? words.length : 0;
    const cc = stripped.length;
    return { wordCount: wc, charCount: cc };
  }, [s.editor.md]);

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
          color: "var(--color-muted)",
        }}
      >
        <p style={{ fontSize: "1.2rem" }}>Open a New Project!</p>
      </div>
    );
  }
  if (editingCharacter) {
    return <CharacterEditor />;
  }

  /**
   * Helper to wrap the currently selected text in a prefix/suffix.
   * If there is no selection, the function returns early.
   */
  const wrapSelection = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    if (start === end) return;
    const before = s.editor.md.slice(0, start);
    const selected = s.editor.md.slice(start, end);
    const after = s.editor.md.slice(end);
    // Update the markdown in state
    state.editor.md = before + prefix + selected + suffix + after;
    // Restore selection around the newly wrapped text
    const newStart = start + prefix.length;
    const newEnd = newStart + selected.length;
    // Delay to let React update the value
    setTimeout(() => {
      textarea.setSelectionRange(newStart, newEnd);
      textarea.focus();
    }, 0);
  };

  // Formatting handlers operate on the current selection
  const applyBold = () => wrapSelection("**", "**");
  const applyItalic = () => wrapSelection("*", "*");
  const applyUnderline = () => wrapSelection("<u>", "</u>");
  const applyStrikeThrough = () => wrapSelection("~~", "~~");
  const applyHighlight = () => {
    const color = s.editor.highlightColor || "#ffff66";
    wrapSelection(`<span style="background-color: ${color}">`, "</span>");
  };
  const applyFontColor = () => {
    const color = s.editor.fontColor || "#000000";
    wrapSelection(`<span style="color: ${color}">`, "</span>");
  };
  const applyFont = () => {
    const font = s.editor.font || "Arial";
    wrapSelection(`<span style="font-family: ${font}">`, "</span>");
  };
  const applyFontSize = () => {
    const size = s.editor.fontSize || 14;
    wrapSelection(`<span style="font-size: ${size}px">`, "</span>");
  };

  // Persist document on blur
  const onBlur = async () => {
    if (!state.currentDocId) return;
    await saveDoc(state.projectPath, state.currentDocId, state.editor.md);
    state.editor.lastSaved = Date.now();
  };

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        maxWidth: "90%",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Ribbon-like toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 8 }}>
        {/* Font group */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <label>Font:</label>
          <select value={s.editor.font} onChange={(e) => (state.editor.font = e.target.value)}>
            {["Arial", "Georgia", "Courier New", "Times New Roman", "Verdana"].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button onClick={applyFont} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid var(--color-border)" }}>
            Apply
          </button>
          <label>Size:</label>
          <input
            type="number"
            min="8"
            max="72"
            value={s.editor.fontSize}
            onChange={(e) => (state.editor.fontSize = parseInt(e.target.value) || 14)}
            style={{ width: 60 }}
          />
          <button onClick={applyFontSize} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid var(--color-border)" }}>
            Apply
          </button>
        </div>
        {/* Text style group */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={applyBold}
            style={{
              fontWeight: "bold",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              padding: "4px 8px",
              borderRadius: 4,
            }}
            title="Bold (Ctrl+B)"
          >
            B
          </button>
          <button
            onClick={applyItalic}
            style={{
              fontStyle: "italic",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              padding: "4px 8px",
              borderRadius: 4,
            }}
            title="Italic (Ctrl+I)"
          >
            I
          </button>
          <button
            onClick={applyUnderline}
            style={{
              textDecoration: "underline",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              padding: "4px 8px",
              borderRadius: 4,
            }}
            title="Underline"
          >
            U
          </button>
          <button
            onClick={applyStrikeThrough}
            style={{
              textDecoration: "line-through",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              padding: "4px 8px",
              borderRadius: 4,
            }}
            title="Strikethrough"
          >
            S
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 2 }}>
            Highlight:
            <input
              type="color"
              value={s.editor.highlightColor || "#ffff66"}
              onChange={(e) => (state.editor.highlightColor = e.target.value)}
              onBlur={applyHighlight}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 2 }}>
            Color:
            <input
              type="color"
              value={s.editor.fontColor || "#000000"}
              onChange={(e) => (state.editor.fontColor = e.target.value)}
              onBlur={applyFontColor}
            />
          </label>
        </div>
        {/* Paragraph group */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <label>Align:</label>
          {["left", "center", "right"].map((algn) => (
            <button
              key={algn}
              onClick={() => (state.editor.align = algn)}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid var(--color-border)",
                background: s.editor.align === algn ? "#e5e7eb" : "var(--color-surface)",
              }}
            >
              {algn.charAt(0).toUpperCase()}
            </button>
          ))}
          <label>Line spacing:</label>
          <select
            value={String(s.editor.lineHeight)}
            onChange={(e) => (state.editor.lineHeight = parseFloat(e.target.value))}
          >
            {["1", "1.2", "1.4", "1.6", "2"].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Editable area */}
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
          fontSize: `${s.editor.fontSize}px`,
          lineHeight: s.editor.lineHeight,
          textAlign: s.editor.align as any,
          resize: "none",
          overflowY: "auto",
          // Colours applied on selection via markup, not globally
          background: "var(--color-surface)",
          color: "var(--color-text)",
        }}
        aria-label="Document editor"
      />

      {/* Live preview */}
      <MarkdownPreview md={s.editor.md} />

      {/* Counters */}
      <WordCounter
        count={wordCount}
        label="Words"
        anchor="left"
        onClick={() => (state.editor.showCharCount = !s.editor.showCharCount)}
      />
      {s.editor.showCharCount && (
        <WordCounter count={charCount} label="Characters" anchor="right" />
      )}

    </div>
  );
}