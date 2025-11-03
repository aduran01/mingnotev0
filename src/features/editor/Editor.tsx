import * as React from "react";
import { useRef, useEffect, useState } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import { saveDoc } from "../../lib/ipc";
import CharacterEditor from "./CharacterEditor";
import WordCounter from "./WordCounter";

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
  const editorRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

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

  // Ensure execCommand uses CSS styles instead of deprecated <font> tags
  useEffect(() => {
    try {
      document.execCommand("styleWithCSS", false, "true");
    } catch {
      /* ignore */
    }
  }, []);

  // Compute word and character counts based on the current HTML.  Inline comment
  // spans are removed from a clone of the DOM before counting so that their
  // text does not contribute to the counts.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) {
      setWordCount(0);
      setCharCount(0);
      return;
    }
    const clone = el.cloneNode(true) as HTMLElement;
    // Remove inline comments from the clone
    clone.querySelectorAll(".inline-comment").forEach((c) => c.remove());
    const text = clone.innerText || "";
    const words = text.trim().split(/\s+/).filter(Boolean);
    setWordCount(text.trim() ? words.length : 0);
    setCharCount(text.length);
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
   * Helper to wrap the current selection in a span with given CSS
   * properties.  If there is no selection, nothing happens.
   */
  const wrapSelectionWithSpan = (styles: Partial<CSSStyleDeclaration>) => {
    const el = editorRef.current;
    if (!el) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement("span");
    Object.assign(span.style, styles);
    span.appendChild(range.extractContents());
    range.insertNode(span);
    // Move cursor to end of the inserted span
    selection.collapse(span, span.childNodes.length);
    // Update state with new HTML
    state.editor.md = el.innerHTML;
  };

  /**
   * Insert an inline comment by wrapping the selected text in a span
   * with the special `inline-comment` class.  If no text is selected
   * the function does nothing.
   */
  const applyInlineComment = () => {
    const el = editorRef.current;
    if (!el) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement("span");
    span.className = "inline-comment";
    // Bold inside comments via CSS; no need to set weight here
    span.appendChild(range.extractContents());
    range.insertNode(span);
    selection.collapse(span, span.childNodes.length);
    state.editor.md = el.innerHTML;
  };

  // Formatting handlers using execCommand for basic styles
  const applyBold = () => {
    editorRef.current?.focus();
    document.execCommand("bold");
    state.editor.md = editorRef.current?.innerHTML || "";
  };
  const applyItalic = () => {
    editorRef.current?.focus();
    document.execCommand("italic");
    state.editor.md = editorRef.current?.innerHTML || "";
  };
  const applyUnderline = () => {
    editorRef.current?.focus();
    document.execCommand("underline");
    state.editor.md = editorRef.current?.innerHTML || "";
  };
  const applyStrikeThrough = () => {
    editorRef.current?.focus();
    document.execCommand("strikeThrough");
    state.editor.md = editorRef.current?.innerHTML || "";
  };
  const applyHighlight = () => {
    const color = s.editor.highlightColor || "#ffff66";
    wrapSelectionWithSpan({ backgroundColor: color });
  };
  const applyFontColor = () => {
    const color = s.editor.fontColor || "#000000";
    wrapSelectionWithSpan({ color });
  };
  const applyFont = () => {
    const font = s.editor.font || "Arial";
    wrapSelectionWithSpan({ fontFamily: font });
  };
  const applyFontSize = () => {
    const size = s.editor.fontSize || 14;
    wrapSelectionWithSpan({ fontSize: `${size}px` });
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
            title="Bold"
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
            title="Italic"
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
          <button
            onClick={applyInlineComment}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              padding: "4px 8px",
              borderRadius: 4,
            }}
            title="Inline comment"
          >
            //
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
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => {
          const html = (e.target as HTMLElement).innerHTML;
          state.editor.md = html;
        }}
        onBlur={onBlur}
        style={{
          flex: 1,
          minHeight: 0,
          padding: 12,
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          fontFamily: s.editor.font,
          fontSize: `${s.editor.fontSize}px`,
          lineHeight: s.editor.lineHeight,
          textAlign: s.editor.align as any,
          overflowY: "auto",
          background: "var(--color-surface)",
          color: "var(--color-text)",
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
        }}
        // Set initial HTML; React will ignore updates after mount because we
        // manage innerHTML manually via onInput and state.editor.md
        dangerouslySetInnerHTML={{ __html: s.editor.md || "" }}
        aria-label="Document editor"
      />

      {/* Counters */}
      <WordCounter
        count={wordCount}
        label="Words"
        anchor="left"
        onClick={() => (state.editor.showCharCount = !s.editor.showCharCount)}
      />
      {s.editor.showCharCount && <WordCounter count={charCount} label="Characters" anchor="right" />}
    </div>
  );
}