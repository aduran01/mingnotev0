import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import { listTree, newDoc, newFolder } from "../../lib/ipc";

// Align with your real store types:
// Doc:    { id: string; title: string; folderId: string | null }
// Folder: { id: string; name: string; parentId: string | null }

type Folder = { id: string; name: string; parentId: string | null };
type Doc    = { id: string; title: string; folderId: string | null };

type TreeNode =
  | { kind: "folder"; id: string; name: string; children: TreeNode[] }
  | { kind: "doc"; id: string; title: string };

export default function Tree() {
  const s = useSnapshot(state);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    if (!state.projectPath) return;
    const { folders: f, docs: d } = await listTree(state.projectPath);
    // keep both local and global in sync
    setFolders(f);
    setDocs(d);
    state.folders = f;
    state.docs = d;
  }, []);

  // initial + on project change
  useEffect(() => {
    if (s.projectPath) refresh();
  }, [s.projectPath, refresh]);

  const rootNodes = useMemo<TreeNode[]>(() => buildTree(folders, docs), [folders, docs]);

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const createFolder = async (parentId: string | null) => {
    if (!state.projectPath) return;
    const name = prompt("New folder name?") || "New Folder";
    await newFolder(state.projectPath, name, parentId);
    await refresh();
    if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
  };

  const createDoc = async (folderId: string | null) => {
    if (!state.projectPath) return;
    const title = prompt("New document title?") || "Untitled";
    const id = await newDoc(state.projectPath, title, folderId);
    await refresh();
    state.currentDocId = id;
    if (folderId) setExpanded((e) => ({ ...e, [folderId]: true }));
  };

  return (
    <div style={{ padding: 12 }}>
      {/* Root-level actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => createDoc(null)}>+ Doc</button>
        <button onClick={() => createFolder(null)}>+ Folder</button>
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

/* ----------------------- Helpers ----------------------- */

function buildTree(folders: Folder[], docs: Doc[]): TreeNode[] {
  // Index subfolders by parent folder id
  const childrenByParent: Record<string | null, Folder[]> = {};
  for (const f of folders) {
    const key = f.parentId ?? null;
    (childrenByParent[key] ||= []).push(f);
  }

  // Index docs by their folderId (this is the key fix)
  const docsByFolder: Record<string | null, Doc[]> = {};
  for (const d of docs) {
    const key = d.folderId ?? null;
    (docsByFolder[key] ||= []).push(d);
  }

  const makeFolderNode = (f: Folder): TreeNode => ({
    kind: "folder",
    id: f.id,
    name: f.name,
    children: [
      // subfolders first
      ...(childrenByParent[f.id] || []).map(makeFolderNode),
      // then docs in this folder
      ...((docsByFolder[f.id] || []).map((d) => ({ kind: "doc", id: d.id, title: d.title }) as TreeNode)),
    ],
  });

  // Root nodes = root folders + docs with folderId === null
  const rootFolders = (childrenByParent[null] || []).map(makeFolderNode);
  const rootDocs = (docsByFolder[null] || []).map((d) => ({ kind: "doc", id: d.id, title: d.title }) as TreeNode);

  // Sorting helpers (folders first, then docs; A–Z within type)
  const sortNodes = (nodes: TreeNode[]) =>
    nodes.slice().sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      const an = a.kind === "folder" ? a.name : a.title;
      const bn = b.kind === "folder" ? b.name : b.title;
      return an.localeCompare(bn);
    });

  const sortDeep = (n: TreeNode): TreeNode => {
    if (n.kind === "folder") {
      const kids = sortNodes(n.children).map(sortDeep);
      return { ...n, children: kids };
    }
    return n;
  };

  return sortNodes([...rootFolders, ...rootDocs]).map(sortDeep);
}

/* ----------------------- UI ----------------------- */

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
            <div style={{ display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}>
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

const miniBtnStyle: React.CSSProperties = {
  padding: "2px 6px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  cursor: "pointer",
  background: "var(--card)",
  color: "var(--fg)",
};