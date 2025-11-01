import * as React from "react";
import "./theme.css";
import Tree from "./features/tree/Tree";
import Editor from "./features/editor/Editor";
import { useSnapshot } from "valtio";
import { state } from "./lib/store";
import { open } from "@tauri-apps/plugin-dialog";
import { createProject, openProject, loadDoc, listTree, backupProject } from "./lib/ipc";

export default function App() {
  const s = useSnapshot(state);

  const createOrOpen = async (kind: "open" | "create") => {
    try {
      const dir = await open({ directory: true, multiple: false });
      if (!dir || Array.isArray(dir)) return;

      if (kind === "create") {
        const name = prompt("Project name?", "My project") || "My project";
        const p = await createProject(dir as string, name);
        state.projectPath = p;
      } else {
        const p = await openProject(dir as string);
        state.projectPath = p;
      }

      const { docs } = await listTree(state.projectPath);
      if (docs[0]) state.currentDocId = docs[0].id;
    } catch (err) {
      alert(`Failed to open directory: ${err}`);
      console.error(err);
    }
  };

  React.useEffect(() => {
    (async () => {
      if (!s.projectPath || !s.currentDocId) return;
      const md = await loadDoc(s.projectPath, s.currentDocId);
      state.editor.md = md;
    })();
  }, [s.projectPath, s.currentDocId]);

  const onBackup = async () => {
    await backupProject(s.projectPath);
    alert("Backup created in /backups");
  };

  return (
    <div className="app-shell">
      {/* Header with consistent spacing and a clear title */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "16px",
          gap: "12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: 0, marginRight: "auto" }}>MingNote</h1>
        <button onClick={() => createOrOpen("create")} aria-label="Create a new project">
          🌸 New project
        </button>
        <button onClick={() => createOrOpen("open")} aria-label="Open an existing project">
          📂 Open project
        </button>
        <button onClick={onBackup} aria-label="Back up current project">
          💾 Backup
        </button>
      </header>

      {/* Main area: tree and editor */}
      <main
        style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          height: "calc(100vh - 72px)",
          overflow: "hidden",
          background: "var(--bg)",
        }}
      >
        <aside
          style={{
            overflowY: "auto",
            background: "var(--chrome)",
            padding: "0 8px",
          }}
        >
          <Tree />
        </aside>
        <section
          style={{
            height: "100%",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            padding: "16px",
            background: "var(--bg)",
          }}
        >
          <Editor />
        </section>
      </main>
    </div>
  );
}
