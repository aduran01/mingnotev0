import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import { listTree, newDoc, newFolder } from "../../lib/ipc";

// Align with your real store types:
// Doc:    { id: string; title: string; folderId: string | null }
// Folder: { id: string; name: string; parentId: string | null }

type Folder = { id: string; name: string; parentId: string | null };
type Doc    = { id: string; title: string; folderId: string | null };

// Normalize null IDs to a stable string key for Record<> maps
const ROOT_KEY = "__ROOT__";
const keyOf = (id: string | null): string => id ?? ROOT_KEY;

/**
 * A discriminated union of possible tree nodes. Folders can have children,
 * whereas docs are leaf nodes.
 */
type TreeNode =
  | { kind: "folder"; id: string; name: string; children: TreeNode[] }
  | { kind: "doc"; id: string; title: string };

/**
 * Tree component renders a nested list of folders and documents. It supports
 * creating new folders and documents at any level, expanding and collapsing
 * folders, and keeps the global store in sync.
 */
export default function Tree() {
  // Subscribe to global state to re-render when projectPath or selected doc changes
  const snapshot = useSnapshot(state);
  // local copies of folder and doc arrays fetched from the backend
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  // track which folders are expanded in the UI
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  /**
   * Refresh the folder/doc lists from the current project path.
   * Also keep the global state in sync so other components can react.
   */
  const refresh = useCallback(async () => {
    if (!state.projectPath) return;
    const { folders: f, docs: d } = await listTree(state.projectPath);
    // update local lists
    setFolders(f);
    setDocs(d);
    // propagate to global state
    state.folders = f;
    state.docs = d;
  }, []);

  // Whenever the projectPath changes, re-fetch the tree.
  useEffect(() => {
    if (snapshot.projectPath) {
      refresh();
    }
  }, [snapshot.projectPath, refresh]);

  // Build a nested tree for rendering from the flat lists.
  const rootNodes = useMemo<TreeNode[]>(() => buildTree(folders, docs), [folders, docs]);

  // Toggle expand/collapse state for a folder
  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  /**
   * Create a new folder. If parentId is null, the folder will be at the root.
   * Expands the parent folder so the new child is visible.
   */
  const createFolder = async (parentId: string | null) => {
    // Require a project to be open before adding folders
    if (!state.projectPath) {
      alert("Please create or open a project first.");
      return;
    }
    const name = prompt("New folder name?") || "New Folder";
    await newFolder(state.projectPath, name, parentId);
    await refresh();
    // expand the parent so the new folder appears
    if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
  };

  /**
   * Create a new document. If folderId is null, the doc will be at the root.
   * Sets the currentDocId so the editor loads the new doc,
   * and expands the parent folder so the new doc is visible.
   */
  const createDoc = async (folderId: string | null) => {
    // Require a project to be open before adding documents
    if (!state.projectPath) {
      alert("Please create or open a project first.");
      return;
    }
    const title = prompt("New document title?") || "Untitled";
    const id = await newDoc(state.projectPath, title, folderId);
    await refresh();
    // set the doc as current for editing
    state.currentDocId = id;
    // expand the parent so the new doc appears
    if (folderId) setExpanded((e) => ({ ...e, [folderId]: true }));
  };

  return (
    <div style={{ padding: 12 }}>
      {/* Root-level actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {/* Disable root-level actions when no project is open */}
        <button
          onClick={() => createDoc(null)}
          disabled={!snapshot.projectPath}
          title={snapshot.projectPath ? undefined : "Open or create a project first"}
        >
          + Doc
        </button>
        <button
          onClick={() => createFolder(null)}
          disabled={!snapshot.projectPath}
          title={snapshot.projectPath ? undefined : "Open or create a project first"}
        >
          + Folder
        </button>
      </div>

      <TreeList
        nodes={rootNodes}
        expanded={expanded}
        onToggle={toggle}
        onCreateDoc={createDoc}
        onCreateFolder={createFolder}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Convert flat lists of folders and docs into a nested tree. The tree will
 * include both folders and documents at any depth and sorts children so that
 * folders appear before documents and names are alphabetical.
 */
function buildTree(folders: Folder[], docs: Doc[]): TreeNode[] {
  // childrenByParent maps normalized parent -> child folders
  const childrenByParent: Record<string, Folder[]> = {};
  for (const f of folders) {
    const key = keyOf(f.parentId);
    (childrenByParent[key] ||= []).push(f);
  }

  // docsByFolder maps normalized folder -> docs
  const docsByFolder: Record<string, Doc[]> = {};
  for (const d of docs) {
    const key = keyOf(d.folderId);
    (docsByFolder[key] ||= []).push(d);
  }

  // Recursively assemble a folder node with its children
  const makeFolderNode = (f: Folder): TreeNode => ({
    kind: "folder",
    id: f.id,
    name: f.name,
    children: [
      ...(childrenByParent[f.id] || []).map(makeFolderNode),
      ...((docsByFolder[f.id] || []).map((d: Doc) => ({
        kind: "doc",
        id: d.id,
        title: d.title,
      }) as TreeNode)),
    ],
  });

  // Root = items whose parent/folderId is null → normalized as ROOT_KEY
  const rootFolders = (childrenByParent[ROOT_KEY] || []).map(makeFolderNode);
  const rootDocs = (docsByFolder[ROOT_KEY] || []).map((d: Doc) => ({
    kind: "doc",
    id: d.id,
    title: d.title,
  }) as TreeNode);

  // Sort: folders first, then docs; A→Z within type
  const sortNodes = (nodes: TreeNode[]) =>
    nodes.slice().sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      const an = a.kind === "folder" ? a.name : a.title;
      const bn = b.kind === "folder" ? b.name : b.title;
      return an.localeCompare(bn);
    });

  const sortDeep = (n: TreeNode): TreeNode =>
    n.kind === "folder"
      ? { ...n, children: sortNodes(n.children).map(sortDeep) }
      : n;

  return sortNodes([...rootFolders, ...rootDocs]).map(sortDeep);
}


/* -------------------------------------------------------------------------- */

/**
 * Render an unordered list (<ul>) representing a nested tree. Folders can be
 * expanded/collapsed and have context actions for creating new docs or folders.
 */
function TreeList(props: {
  nodes: TreeNode[];
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onCreateDoc: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  depth?: number;
}) {
  const { nodes, expanded, onToggle, onCreateDoc, onCreateFolder, depth = 0 } = props;

  return (
    <ul style={{ listStyle: "none", margin: 0, paddingLeft: depth === 0 ? 0 : 14 }}>
      {nodes.map((n) =>
        n.kind === "folder" ? (
          <li key={n.id} style={{ marginBottom: 4 }}>
            <div
              style={{ display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}
            >
              <FolderCaret isOpen={!!expanded[n.id]} onClick={() => onToggle(n.id)} />
              <span
                style={{ fontWeight: 700, cursor: "pointer" }}
                onClick={() => onToggle(n.id)}
                title={n.name}
              >
                📁 {n.name}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <small
                  role="button"
                  style={miniBtnStyle}
                  onClick={() => onCreateDoc(n.id)}
                  title="Add document here"
                >
                  + doc
                </small>
                <small
                  role="button"
                  style={miniBtnStyle}
                  onClick={() => onCreateFolder(n.id)}
                  title="Add subfolder here"
                >
                  + folder
                </small>
              </div>
            </div>

            {expanded[n.id] && n.children.length > 0 && (
              <TreeList
                nodes={n.children}
                expanded={expanded}
                onToggle={onToggle}
                onCreateDoc={onCreateDoc}
                onCreateFolder={onCreateFolder}
                depth={depth + 1}
              />
            )}
          </li>
        ) : (
          <li key={n.id} style={{ marginBottom: 3, paddingLeft: 22 }}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                state.currentDocId = n.id;
              }}
              style={{ textDecoration: "none", color: "inherit" }}
              title={n.title}
            >
              📝 {n.title}
            </a>
          </li>
        )
      )}

      {nodes.length === 0 && depth === 0 && (
        <li style={{ opacity: 0.7, padding: "4px 0" }}>
          <em>No items yet. Use “+ Doc” or “+ Folder”.</em>
        </li>
      )}
    </ul>
  );
}

/**
 * A simple caret (arrow) component that toggles the open/closed state of a folder.
 */
function FolderCaret({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex",
        width: 14,
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        opacity: 0.8,
      }}
      aria-label={isOpen ? "Collapse" : "Expand"}
      title={isOpen ? "Collapse" : "Expand"}
    >
      {isOpen ? "▾" : "▸"}
    </span>
  );
}

/**
 * Shared styles for the mini buttons that appear next to folders for creating new
 * docs or folders. They adapt to the current theme via CSS variables.
 */
const miniBtnStyle: React.CSSProperties = {
  padding: "2px 6px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  cursor: "pointer",
  background: "var(--card)",
  color: "var(--fg)",
};