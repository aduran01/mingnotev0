import { useEffect, useRef } from "react";
import { saveDoc } from "../../lib/ipc";
import { state } from "../../lib/store";
import { useSnapshot } from "valtio";
import CharacterEditor from "../../features/editor/CharacterEditor";

export default function Editor() {
  const s = useSnapshot(state);
  const timer = useRef<number | undefined>(undefined);

  // Autosave docs every 5s (not active when in character mode)
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

  // Switcher
  if (s.currentCharId) return <CharacterEditor />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="card" style={{ margin: 12, padding: 12, flex: 1, display: "flex", minHeight: 0 }}>
        <textarea
          className="editor"
          style={{
            width: "100%",
            height: "100%",
            resize: "none",
            outline: "none",
            border: "none",
            background: "transparent",
            lineHeight: 1.6,
          }}
          value={s.editor.md}
          onChange={(e) => (state.editor.md = e.target.value)}
          onBlur={onBlur}
          placeholder="# Start typing…"
          aria-label="Markdown editor"
        />
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", padding: "0 16px 12px", alignSelf: "flex-end" }}>
        Saved {s.editor.lastSaved ? new Date(s.editor.lastSaved).toLocaleTimeString() : "—"}
      </div>
    </div>
  );
}
