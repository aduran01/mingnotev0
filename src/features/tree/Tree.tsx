import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import { listTree, newDoc, newFolder, newCharacter } from "../../lib/ipc";

type Folder = { id: string; name: string; parentId: string | null };
type Doc = { id: string; title: string; folderId: string | null };
type Character = { id: string; name: string; folderId: string | null };

const ROOT_KEY = "__ROOT__";
const keyOf = (id: string | null): string => id ?? ROOT_KEY;

type TreeNode =
  | { kind: "folder"; id: string; name: string; children: TreeNode[] }
  | { kind: "doc"; id: string; title: string }
  | { kind: "character"; id: string; name: string };

export default function Tree() {
  const snapshot = useSnapshot(state);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    if (!state.projectPath) return;
    const { folders: f, docs: d, characters: c } = await listTree(state.projectPath);
    setFolders(f as Folder[]);
    setDocs(d as Doc[]);
    setCharacters((c || []) as Character[]);
    state.folders = f as Folder[];
    state.docs = d as Doc[];
    state.characters = (c || []) as Character[];
  }, []);

  useEffect(() => {
    if (snapshot.projectPath) refresh();
  }, [snapshot.projectPath, refresh]);

  const rootNodes = useMemo(() => buildTree(folders, docs, characters), [folders, docs, characters]);

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const createFolder = async (parentId: string | null) => {
    if (!state.projectPath) return alert("Open or create a project first.");
    const name = prompt("New folder name?", "") || "New folder";
    await newFolder(state.projectPath, name, parentId);
    await refresh();
    if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
  };

  const createDoc = async (folderId: string | null) => {
    if (!state.projectPath) return alert("Open or create a project first.");
    const title = prompt("New document title?", "") || "Untitled document";
    const id = await newDoc(state.projectPath, title, folderId);
    await refresh();
    state.currentDocId = id;
    state.currentCharId = "";
    if (folderId) setExpanded((e) => ({ ...e, [folderId]: true }));
  };

  const createCharacterTab = async (folderId: string | null) => {
    if (!state.projectPath) return alert("Open or create a project first.");
    const name = prompt("New character name?", "") || "New character";
    const id = await newCharacter(state.projectPath, name, folderId);
    await refresh();
    state.currentCharId = id;
    state.currentDocId = "";
    if (folderId) setExpanded((e) => ({ ...e, [folderId]: true }));
  };

  return (
    <nav aria-label="Project navigation" style={{ padding: "16px" }}>
      {/* Top-level add buttons with sentence-case labels and consistent spacing */}
      <div style={{ marginBottom: "16px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button onClick={() => createDoc(null)} disabled={!snapshot.projectPath}>
          + Add document
        </button>
        <button onClick={() => createFolder(null)} disabled={!snapshot.projectPath}>
          + Add folder
        </button>
        <button onClick={() => createCharacterTab(null)} disabled={!snapshot.projectPath}>
          + Add character
        </button>
      </div>
      <TreeList
        nodes={rootNodes}
        expanded={expanded}
        onToggle={toggle}
        onCreateDoc={createDoc}
        onCreateFolder={createFolder}
        onCreateCharacter={createCharacterTab}
      />
      {rootNodes.length === 0 && (
        <p style={{ opacity: 0.7, marginTop: "12px" }}>
          <em>No items yet. Use the buttons above to add content.</em>
        </p>
      )}
    </nav>
  );
}

function buildTree(folders: Folder[], docs: Doc[], chars: Character[]): TreeNode[] {
  const childrenByParent: Record<string, Folder[]> = {};
  for (const f of folders) (childrenByParent[keyOf(f.parentId)] ||= []).push(f);

  const docsByFolder: Record<string, Doc[]> = {};
  for (const d of docs) (docsByFolder[keyOf(d.folderId)] ||= []).push(d);

  const charsByFolder: Record<string, Character[]> = {};
  for (const c of chars) (charsByFolder[keyOf(c.folderId)] ||= []).push(c);

  const makeFolderNode = (f: Folder): TreeNode => ({
    kind: "folder",
    id: f.id,
    name: f.name,
    children: [
      ...(childrenByParent[f.id] || []).map(makeFolderNode),
      ...((docsByFolder[f.id] || []).map((d) => ({ kind: "doc", id: d.id, title: d.title })) as TreeNode[]),
      ...((charsByFolder[f.id] || []).map((c) => ({ kind: "character", id: c.id, name: c.name })) as TreeNode[]),
    ],
  });

  const rootFolders = (childrenByParent[ROOT_KEY] || []).map(makeFolderNode);
  const rootDocs = (docsByFolder[ROOT_KEY] || []).map(
    (d) => ({ kind: "doc", id: d.id, title: d.title }) as TreeNode,
  );
  const rootChars = (charsByFolder[ROOT_KEY] || []).map(
    (c) => ({ kind: "character", id: c.id, name: c.name }) as TreeNode,
  );

  const sortNodes = (nodes: TreeNode[]) =>
    nodes.slice().sort((a, b) => {
      if (a.kind !== b.kind) {
        if (a.kind === "folder") return -1;
        if (b.kind === "folder") return 1;
      }
      const an = a.kind === "folder" ? a.name : a.kind === "doc" ? (a as any).title : (a as any).name;
      const bn = b.kind === "folder" ? b.name : b.kind === "doc" ? (b as any).title : (b as any).name;
      return an.localeCompare(bn);
    });

  const sortDeep = (n: TreeNode): TreeNode =>
    n.kind === "folder" ? { ...n, children: sortNodes(n.children).map(sortDeep) } : n;

  return sortNodes([...rootFolders, ...rootDocs, ...rootChars]).map(sortDeep);
}

function TreeList(props: {
  nodes: TreeNode[];
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onCreateDoc: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onCreateCharacter: (folderId: string | null) => void;
  depth?: number;
}) {
  const {
    nodes,
    expanded,
    onToggle,
    onCreateDoc,
    onCreateFolder,
    onCreateCharacter,
    depth = 0,
  } = props;

  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        paddingLeft: depth === 0 ? 0 : 16,
      }}
    >
      {nodes.map((n) =>
        n.kind === "folder" ? (
          <li key={n.id} style={{ marginBottom: "8px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                userSelect: "none",
              }}
            >
              <FolderCaret isOpen={!!expanded[n.id]} onClick={() => onToggle(n.id)} />
              <span
                style={{ fontWeight: 600, cursor: "pointer" }}
                onClick={() => onToggle(n.id)}
                title={n.name}
              >
                📁 {n.name}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
                <button
                  onClick={() => onCreateDoc(n.id)}
                  style={miniBtnStyle}
                  aria-label="Add document to folder"
                >
                  + doc
                </button>
                <button
                  onClick={() => onCreateFolder(n.id)}
                  style={miniBtnStyle}
                  aria-label="Add subfolder"
                >
                  + folder
                </button>
                <button
                  onClick={() => onCreateCharacter(n.id)}
                  style={miniBtnStyle}
                  aria-label="Add character"
                >
                  + char
                </button>
              </div>
            </div>

            {expanded[n.id] && n.children.length > 0 && (
              <TreeList
                nodes={n.children}
                expanded={expanded}
                onToggle={onToggle}
                onCreateDoc={onCreateDoc}
                onCreateFolder={onCreateFolder}
                onCreateCharacter={onCreateCharacter}
                depth={depth + 1}
              />
            )}
          </li>
        ) : n.kind === "doc" ? (
          <li key={n.id} style={{ marginBottom: "6px", paddingLeft: "20px" }}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                state.currentDocId = n.id;
                state.currentCharId = "";
              }}
              style={{ textDecoration: "none", color: "inherit" }}
              title={n.title}
            >
              📝 {n.title}
            </a>
          </li>
        ) : (
          <li key={n.id} style={{ marginBottom: "6px", paddingLeft: "20px" }}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                state.currentCharId = n.id;
                state.currentDocId = "";
              }}
              style={{ textDecoration: "none", color: "inherit" }}
              title={n.name}
            >
              👤 {n.name}
            </a>
          </li>
        ),
      )}
    </ul>
  );
}

function FolderCaret({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) {
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

// Slightly larger mini-button style for better click targets
const miniBtnStyle: React.CSSProperties = {
  padding: "4px 6px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  cursor: "pointer",
  background: "var(--card)",
  color: "var(--fg)",
  fontSize: "0.75rem",
};
