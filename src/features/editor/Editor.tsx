import { useEffect, useRef } from "react";
import { saveDoc } from "../../lib/ipc";
import { state } from "../../lib/store";
import { useSnapshot } from "valtio";
import CharacterEditor from "./CharacterEditor";

/**
 * Modified Editor component.  When no project is open, a friendly prompt
 * encourages the user to create or open a project.  The editor still
 * auto‑saves documents and defers to the CharacterEditor when a
 * character tab is active.
 */
export default function Editor() {
  const s = useSnapshot(state);
  const timer = useRef<number | undefined>(undefined);

  // Auto‑save every 5s
  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      if (!s.currentDocId) return;
      await saveDoc(s.projectPath, s.currentDocId, s.editor.md);
      state.editor.lastSaved = Date.now();
    }, 5000) as unknown as number;

    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [s.currentDocId, s.editor.md]);

  const onBlur = async () => {
    if (!s.currentDocId) return;
    await saveDoc(s.projectPath, s.currentDocId, s.editor.md);
    state.editor.lastSaved = Date.now();
  };

  // If no project is open, prompt the user to open or create one
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

  // Character editing takes precedence over document editing
  if (s.currentCharId) return <CharacterEditor />;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        maxWidth: "90%", // fill more of the available width
        margin: "0 auto",
      }}
    >
      <div
        className="card"
        style={{
          flex: 1,
          margin: "16px",
          padding: "0",
          height: "80vh", // ⬆️ MUCH taller box (vertical size)
          overflow: "auto", // ⬅️ scrolls inside the box
          display: "flex",
          flexDirection: "column",
        }}
      >
        <textarea
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
            lineHeight: 1.6,
            fontSize: "1rem",
            boxSizing: "border-box",
            overflow: "auto", // ⬅️ ensures text scrolls inside box
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
        Saved {s.editor.lastSaved ? new Date(s.editor.lastSaved).toLocaleTimeString() : "—"}
      </div>
    </div>
  );
}