import * as React from "react";
import { useRef, useEffect } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import { saveDoc } from "../../lib/ipc";
import CharacterEditor from "./CharacterEditor";
import WordCounter from "./WordCounter";
import StickyNotes from "./StickyNotes";

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

  // Character count toggle via Ctrl/⌘+Shift+C
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        state.editor.showCharCount = !state.editor.showCharCount;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Word/char count ignoring inline comments
  const { wordCount, charCount } = React.useMemo(() => {
    const text = s.editor.md || "";
    const stripped = text.replace(/\/\/[\s\S]*?\/\/\s*/g, "");
    const words = stripped.trim().split(/\s+/).filter(Boolean);
    const wc = stripped.trim() ? words.length : 0;
    const cc = stripped.length;
    return { wordCount: wc, charCount: cc };
  }, [s.editor.md]);

  const noProject = !s.projectPath;
  const editingCharacter = !!s.currentCharId;
  if (noProject) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
        <p style={{ fontSize: "1.2rem" }}>Open a New Project!</p>
      </div>
    );
  }
  if (editingCharacter) {
    return <CharacterEditor />;
  }

  // Toolbar action handlers
  const toggleBold = () => (state.editor.bold = !state.editor.bold);
  const toggleItalic = () => (state.editor.italic = !state.editor.italic);
  const toggleUnderline = () => (state.editor.underline = !state.editor.underline);
  const toggleStrikeThrough = () => (state.editor.strikeThrough = !state.editor.strikeThrough);
  const handleHighlightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    state.editor.highlightColor = e.target.value;
  };
  const handleFontColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    state.editor.fontColor = e.target.value;
  };
  const handleFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    state.editor.font = e.target.value;
  };
  const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    state.editor.fontSize = parseInt(e.target.value) || 14;
  };
  const handleLineSpacingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    state.editor.lineHeight = parseFloat(e.target.value);
  };
  const handleAlignChange = (align: string) => {
    state.editor.align = align;
  };

  const onBlur = async () => {
    if (!state.currentDocId) return;
    await saveDoc(state.projectPath, state.currentDocId, state.editor.md);
    state.editor.lastSaved = Date.now();
  };

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", maxWidth: "90%", margin: "0 auto", display: "flex", flexDirection: "column" }}>
      {/* Ribbon-like toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 8 }}>
        {/* Font group */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <label>Font:</label>
          <select value={s.editor.font} onChange={handleFontChange}>
            {["Arial", "Georgia", "Courier New", "Times New Roman", "Verdana"].map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <label>Size:</label>
          <input
            type="number"
            min="8"
            max="72"
            value={s.editor.fontSize}
            onChange={handleFontSizeChange}
            style={{ width: 60 }}
          />
        </div>
        {/* Text style group */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={toggleBold} style={{
            fontWeight: "bold",
            background: s.editor.bold ? "#e5e7eb" : "var(--color-surface)",
            border: "1px solid var(--color-border)",
            padding: "4px 8px",
            borderRadius: 4,
          }}>B</button>
          <button onClick={toggleItalic} style={{
            fontStyle: "italic",
            background: s.editor.italic ? "#e5e7eb" : "var(--color-surface)",
            border: "1px solid var(--color-border)",
            padding: "4px 8px",
            borderRadius: 4,
          }}>I</button>
          <button onClick={toggleUnderline} style={{
            textDecoration: "underline",
            background: s.editor.underline ? "#e5e7eb" : "var(--color-surface)",
            border: "1px solid var(--color-border)",
            padding: "4px 8px",
            borderRadius: 4,
          }}>U</button>
          <button onClick={toggleStrikeThrough} style={{
            textDecoration: "line-through",
            background: s.editor.strikeThrough ? "#e5e7eb" : "var(--color-surface)",
            border: "1px solid var(--color-border)",
            padding: "4px 8px",
            borderRadius: 4,
          }}>S</button>
          <label style={{ display: "flex", alignItems: "center", gap: 2 }}>
            Highlight:
            <input type="color" value={s.editor.highlightColor || "#ffffff"} onChange={handleHighlightChange} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 2 }}>
            Color:
            <input type="color" value={s.editor.fontColor || "#000000"} onChange={handleFontColorChange} />
          </label>
        </div>
        {/* Paragraph group */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <label>Align:</label>
          {["left", "center", "right"].map((algn) => (
            <button
              key={algn}
              onClick={() => handleAlignChange(algn)}
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
          <select value={String(s.editor.lineHeight)} onChange={handleLineSpacingChange}>
            {["1", "1.2", "1.4", "1.6", "2"].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Single editable area (no preview) */}
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
          fontWeight: s.editor.bold ? "bold" : "normal",
          fontStyle: s.editor.italic ? "italic" : "normal",
          textDecoration: `${s.editor.underline ? "underline" : ""} ${s.editor.strikeThrough ? "line-through" : ""}`.trim(),
          background: s.editor.highlightColor || "var(--color-surface)",
          color: s.editor.fontColor || "inherit",
          textAlign: s.editor.align as any,
          resize: "none",
          overflowY: "auto",
        }}
        aria-label="Document editor"
      />

      {/* Counters */}
      <WordCounter count={wordCount} label="Words" anchor="left" />
      {s.editor.showCharCount && (
        <WordCounter count={charCount} label="Characters" anchor="right" />
      )}

      {/* Sticky notes */}
      <StickyNotes />
    </div>
  );
}
