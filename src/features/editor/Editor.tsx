// src/features/editor/Editor.tsx
import * as React from "react";
import { useRef, useEffect } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import { saveDoc } from "../../lib/ipc";
import CharacterEditor from "./CharacterEditor";

/**
 * Editor component with a formatting toolbar.  Users can choose fonts,
 * line spacing, and apply bold/italic to selected text.  The editor
 * continues to autosave every 5 seconds and stores the chosen font and
 * line spacing in global state.
 */
export default function Editor() {
  const s = useSnapshot(state);
  const timer = useRef<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Autosave on interval
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

  // Save on blur
  const onBlur = async () => {
    if (!s.currentDocId) return;
    await saveDoc(state.projectPath, s.currentDocId, s.editor.md);
    state.editor.lastSaved = Date.now();
  };

  // No project open
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

  // Character editing takes precedence
  if (s.currentCharId) return <CharacterEditor />;

  // Helpers to wrap selected text in Markdown bold/italic
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
    // restore cursor
    requestAnimationFrame(() => {
      if (el) {
        const pos = start + prefix.length + selected.length + suffix.length;
        el.selectionStart = el.selectionEnd = pos;
        el.focus();
      }
    });
  };

  // Toolbar handlers
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
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          margin: "8px 16px",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Font:
          <select value={s.editor.font} onChange={handleFontChange}>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="serif">Serif</option>
            <option value="sans-serif">Sans-serif</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Line spacing:
          <select
            value={s.editor.lineHeight.toString()}
            onChange={handleLineSpacingChange}
          >
            <option value="1">1.0</option>
            <option value="1.5">1.5</option>
            <option value="2">2.0</option>
          </select>
        </label>
        <button type="button" onClick={applyBold}>
          <strong>B</strong>
        </button>
        <button type="button" onClick={applyItalic}>
          <em>I</em>
        </button>
      </div>

      {/* Writing area */}
      <div
        className="card"
        style={{
          flex: 1,
          margin: "16px",
          padding: 0,
          height: "80vh",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <textarea
          ref={textareaRef}
          className="editor"
          style={{
            flex: 1,
            width: "100%",
            height: "100%",
            padding: "20px",
            resize: "none",
            outline: "none",
            border: "none",
            background: "transparent",
            lineHeight: s.editor.lineHeight,
            fontSize: "1rem",
            fontFamily: s.editor.font,
            boxSizing: "border-box",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordWrap: "break-word",
          }}
          value={s.editor.md}
          onChange={(e) => (state.editor.md = e.target.value)}
          onBlur={onBlur}
          placeholder="# Start typing…"
          aria-label="Markdown editor"
        />
      </div>

      <div
        style={{
          fontSize: 12,
          color: "var(--muted)",
          padding: "0 16px 12px",
          alignSelf: "flex-end",
        }}
      >
        Saved{" "}
        {s.editor.lastSaved
          ? new Date(s.editor.lastSaved).toLocaleTimeString()
          : "—"}
      </div>
    </div>
  );
}
