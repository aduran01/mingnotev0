import * as React from "react";
import { useEffect, useMemo, useRef } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import { saveDoc } from "../../lib/ipc";
import WordCounter from "./WordCounter";
import StickyNotes from "./StickyNotes";

/* ---------- Helpers ---------- */

// Turn `// ... //` into boxed spans (display‑only)
function applyInlineCommentBoxes(root: HTMLElement) {
  const html = root.innerHTML;
  const replaced = html.replace(
    /\/\/([\s\S]*?)\/\//g,
    (_m, inner) =>
      `<span class="inline-comment" data-inline-comment="1"><strong>${String(inner).trim()}</strong></span>`
  );
  if (replaced !== html) root.innerHTML = replaced;
}

// For counts, strip comment markers from plain text
function stripInlineCommentMarkers(text: string): string {
  return text.replace(/\/\/[^]*?\/\/\s*/g, "");
}

/**
 * Aggressively enforce LTR and remove anything that can reverse glyph/word order.
 * This checks the editor and every ancestor up to <body>.
 */
function forceRealLTR(el: HTMLElement | null) {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (cur.hasAttribute("dir")) cur.removeAttribute("dir");
    const style = (cur as HTMLElement).style;
    if (style) {
      if (style.direction) style.removeProperty("direction");
      if (style.unicodeBidi) style.removeProperty("unicode-bidi");
      if (style.writingMode) style.removeProperty("writing-mode");
      const t = style.transform || "";
      if (
        t &&
        (/scaleX\(\s*-\s*1\s*\)/i.test(t) ||
          /matrix\(\s*-?1[, ]\s*0[, ]\s*0[, ]\s*1/i.test(t))
      ) {
        style.removeProperty("transform");
      }
    }
    cur = cur.parentElement;
  }
  if (el) {
    // Explicitly set the container dir and class to LTR after stripping styles
    el.setAttribute("dir", "ltr");
    el.classList.add("md-editor--ltr");
  }
}

/**
 * Remove bidi artifacts inside the editor content.
 */
function sanitizeBidiArtifacts(root: HTMLElement) {
  // Remove explicit bidi attributes or styles that could flip direction
  root.querySelectorAll<HTMLElement>("[dir]").forEach((el) => el.removeAttribute("dir"));
  root.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const style = el.style;
    let changed = false;
    if (style.direction) {
      style.removeProperty("direction");
      changed = true;
    }
    if (style.unicodeBidi) {
      style.removeProperty("unicode-bidi");
      changed = true;
    }
    if (style.writingMode) {
      style.removeProperty("writing-mode");
      changed = true;
    }
    const t = style.transform || "";
    if (
      t &&
      (/scaleX\(\s*-\s*1\s*\)/i.test(t) ||
        /matrix\(\s*-?1[, ]\s*0[, ]\s*0[, ]\s*1/i.test(t))
    ) {
      style.removeProperty("transform");
      changed = true;
    }
    if (changed && !style.cssText.trim()) el.removeAttribute("style");
  });
  // Remove invisible directional control characters
  const html = root.innerHTML;
  const cleaned = html.replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, "");
  if (cleaned !== html) {
    root.innerHTML = cleaned;
  }
}

export default function DocEditor() {
  const s = useSnapshot(state);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const autosaveRef = useRef<number | undefined>(undefined);
  // Timer used to debounce state updates during typing
  const typingTimerRef = useRef<number | null>(null);

  /* Autosave */
  useEffect(() => {
    if (autosaveRef.current) window.clearInterval(autosaveRef.current);
    autosaveRef.current = window.setInterval(async () => {
      if (!state.currentDocId) return;
      await saveDoc(state.projectPath, state.currentDocId, state.editor.md);
      state.editor.lastSaved = Date.now();
    }, 5000) as unknown as number;
    return () => {
      if (autosaveRef.current) window.clearInterval(autosaveRef.current);
    };
  }, []);

  /* Initialise editor content when a new doc is loaded */
  useEffect(() => {
    if (editorRef.current) {
      // Directly mutate the DOM once when switching docs; don't let React control the value
      editorRef.current.innerHTML = s.editor.md || "";
      forceRealLTR(editorRef.current);
      sanitizeBidiArtifacts(editorRef.current);
    }
  }, [s.currentDocId]);

  // Re-enforce LTR periodically in case parent themes flip styles
  useEffect(() => {
    const handle = window.setInterval(() => {
      if (editorRef.current) forceRealLTR(editorRef.current);
    }, 750);
    return () => window.clearInterval(handle);
  }, []);

  /* Word/char counts (exclude inline comments) */
  const { wordCount, charCount } = useMemo(() => {
    const container = document.createElement("div");
    container.innerHTML = s.editor.md || "";
    const text = container.textContent || "";
    const stripped = stripInlineCommentMarkers(text);
    const words = stripped.trim().split(/\s+/).filter(Boolean);
    return {
      wordCount: stripped.trim() ? words.length : 0,
      charCount: stripped.length,
    };
  }, [s.editor.md]);

  /* Formatting helpers using execCommand for selection */
  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      forceRealLTR(editorRef.current);
      sanitizeBidiArtifacts(editorRef.current);
      // Immediately persist state after formatting operations
      state.editor.md = editorRef.current.innerHTML;
    }
  };
  const onBold = () => exec("bold");
  const onItalic = () => exec("italic");
  const onUnderline = () => exec("underline");
  const onStrike = () => exec("strikeThrough");
  const onHighlight = (hex: string) => exec("backColor", hex);
  const onColor = (hex: string) => exec("foreColor", hex);
  const onAlign = (align: "left" | "center" | "right") => {
    if (!editorRef.current) return;
    editorRef.current.style.textAlign = align;
    forceRealLTR(editorRef.current);
    sanitizeBidiArtifacts(editorRef.current);
    state.editor.md = editorRef.current.innerHTML;
  };
  const onFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    document.execCommand("fontName", false, e.target.value);
    if (editorRef.current) {
      forceRealLTR(editorRef.current);
      sanitizeBidiArtifacts(editorRef.current);
      state.editor.md = editorRef.current.innerHTML;
    }
  };
  const onFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const px = Math.max(8, Math.min(72, parseInt(e.target.value || "14", 10)));
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("fontSize", false, "4");
    if (editorRef.current) {
      const el = editorRef.current;
      // Replace deprecated <font size> with spans and apply pixel font sizes
      el.querySelectorAll("font[size]").forEach((f) => {
        const span = document.createElement("span");
        span.style.fontSize = `${px}px`;
        span.innerHTML = (f as HTMLElement).innerHTML;
        (f as HTMLElement).replaceWith(span);
      });
      forceRealLTR(el);
      sanitizeBidiArtifacts(el);
      state.editor.md = el.innerHTML;
    }
  };
  const onLineHeightChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (editorRef.current) {
      editorRef.current.style.lineHeight = String(parseFloat(e.target.value) || 1.6);
      forceRealLTR(editorRef.current);
      sanitizeBidiArtifacts(editorRef.current);
      state.editor.md = editorRef.current.innerHTML;
    }
  };
  const flushTyping = () => {
    // Persist the content of the editor into application state and autosave
    if (!editorRef.current) return;
    forceRealLTR(editorRef.current);
    sanitizeBidiArtifacts(editorRef.current);
    state.editor.md = editorRef.current.innerHTML;
  };
  const onBlur = async () => {
    // When leaving the editor, flush any pending changes immediately
    flushTyping();
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
      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <label>Font:</label>
          <select defaultValue="Arial" onChange={onFontChange}>
            {[
              "Arial",
              "Georgia",
              "Courier New",
              "Times New Roman",
              "Verdana",
            ].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <label>Size:</label>
          <input
            type="number"
            min={8}
            max={72}
            defaultValue={14}
            onChange={onFontSizeChange}
            style={{ width: 60 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={onBold} style={{ fontWeight: "bold" }}>B</button>
          <button onClick={onItalic} style={{ fontStyle: "italic" }}>I</button>
          <button onClick={onUnderline} style={{ textDecoration: "underline" }}>U</button>
          <button onClick={onStrike} style={{ textDecoration: "line-through" }}>S</button>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Highlight: <input type="color" defaultValue="#fff3a3" onChange={(e) => onHighlight(e.target.value)} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Color: <input type="color" defaultValue="#000000" onChange={(e) => onColor(e.target.value)} />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <label>Align:</label>
          {(["left", "center", "right"] as const).map((algn) => (
            <button key={algn} onClick={() => onAlign(algn)}>
              {algn[0].toUpperCase()}
            </button>
          ))}
          <label>Line spacing:</label>
          <select defaultValue="1.6" onChange={onLineHeightChange}>
            {["1", "1.2", "1.4", "1.6", "2"].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* Editable surface */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        dir="ltr"
        className="md-editor--ltr"
        onInput={() => {
          // Debounce state updates during typing to avoid caret resets
          if (!editorRef.current) return;
          // Always keep the visual element LTR and sanitized as user types
          forceRealLTR(editorRef.current);
          sanitizeBidiArtifacts(editorRef.current);
          // Clear the existing timer if a previous keypress occurred recently
          if (typingTimerRef.current) {
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = null;
          }
          // Schedule a flush shortly after typing stops (200ms)
          typingTimerRef.current = window.setTimeout(() => {
            flushTyping();
            typingTimerRef.current = null;
          }, 200) as unknown as number;
        }}
        onBlur={onBlur}
        style={{
          flex: 1,
          height: "100%",
          padding: 12,
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          background: "var(--color-surface)",
          color: "inherit",
          textAlign: "left",
          overflowY: "auto",
          outline: "none",
          lineHeight: "1.6",
        }}
        aria-label="Document editor"
      />
      {/* Hard LTR + inline-comment style */}
      <style>{`
        .md-editor--ltr, .md-editor--ltr * {
          direction: ltr !important;
          unicode-bidi: normal !important;
          writing-mode: horizontal-tb !important;
        }
        .md-editor--ltr {
          transform: none !important;
        }
        .inline-comment {
          display: inline-block;
          padding: 0 6px;
          margin: 0 2px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: #f3f4f6;
          font-weight: 700;
          color: #374151;
        }
      `}</style>
      {/* Counters */}
      <WordCounter
        count={wordCount}
        label="Words"
        anchor="left"
        onClick={() => (state.editor.showCharCount = !state.editor.showCharCount)}
        color="#e5e7eb"
      />
      {s.editor.showCharCount && (
        <WordCounter count={charCount} label="Characters" anchor="right" color="#f9a8d4" />
      )}
      <StickyNotes />
    </div>
  );
}