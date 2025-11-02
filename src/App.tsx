import * as React from "react";
import "./theme.css";
import Tree from "./features/tree/Tree";
import Editor from "./features/editor/Editor";
import StickyNotes from "./features/editor/StickyNotes";
import { useSnapshot } from "valtio";
import { state } from "./lib/store";
import { open } from "@tauri-apps/plugin-dialog";
import { createProject, openProject, loadDoc, listTree, backupProject } from "./lib/ipc";

/*
 * App
 *
 * The root component for the MingNote application.  It orchestrates
 * project creation/opening, loads documents on selection and renders
 * the file tree alongside the editor.  Sticky notes are mounted
 * outside of the Editor component so they persist across tab
 * switches (e.g. editing a character vs a document).  This file
 * closely follows the structure of the original MingNote `App.tsx`,
 * with the addition of the `StickyNotes` import and placement.
 */

export default function App() {
  const s = useSnapshot(state);

  // Create or open a project directory.  When creating, prompt for
  // a project name and call `createProject`; otherwise call
  // `openProject`.  After opening, populate the first document ID.
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

  // Load the current document whenever the project path or current
  // document ID changes.  This uses the same logic as the original
  // application to populate `state.editor.md` with Markdown.
  React.useEffect(() => {
    (async () => {
      if (!s.projectPath || !s.currentDocId) return;
      const md = await loadDoc(s.projectPath, s.currentDocId);
      state.editor.md = md;
    })();
  }, [s.projectPath, s.currentDocId]);

  // Trigger a backup in the project's `backups` directory
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
          borderBottom: "1px solid var(--color-border)",
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
          background: "var(--color-bg)",
        }}
      >
        <aside
          style={{
            overflowY: "auto",
            background: "var(--color-chrome)",
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
            background: "var(--color-bg)",
          }}
        >
          <Editor />
        </section>
      </main>
      {/* Mount sticky notes at the root so they persist across editor modes */}
      <StickyNotes />
    </div>
  );
}