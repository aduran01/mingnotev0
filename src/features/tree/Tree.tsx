// src/features/tree/Tree.tsx
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import {
  listTree,
  newDoc,
  newFolder,
  newCharacter,
  deleteFolderRecursive,
  deleteDoc,
  deleteCharacter,
} from "../../lib/ipc";
import ConfirmDialog from "../../components/ConfirmDialog";

type Folder = { id: string; name: string; parentId: string | null };
type Doc = { id: string; title: string; folderId: string | null };
type Character = { id: string; name: string; folderId: string | null };

const ROOT_KEY = "__ROOT__";
const keyOf = (id: string | null): string => id ?? ROOT_KEY;

type TreeNode =
  | { kind: "folder"; id: string; name: string; children: TreeNode[] }
  | { kind: "doc"; id: string; title: string }
  | { kind: "character"; id: string; name: string };

type CtxKind = "root" | "folder" | "doc" | "character";

type ContextTarget =
  | { kind: "root" }
  | { kind: "folder"; id: string }
  | { kind: "doc"; id: string }
  | { kind: "character"; id: string };

export default function Tree() {
  const snapshot = useSnapshot(state);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Context menu state: where it opens + what it targets
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ContextTarget;
    visible: boolean;
  }>({ x: 0, y: 0, target: { kind: "root" }, visible: false });

  // Folder delete confirm
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFolderId, setPendingFolderId] = useState<string | null>(null);

  const menuRef = useRef<HTMLUListElement | null>(null);

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

  const rootNodes = useMemo(
    () => buildTree(folders, docs, characters),
    [folders, docs, characters],
  );
  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // ---------- Prompt helpers (Cancel-safe) ----------
  const promptName = (message: string) => {
    const raw = window.prompt(message, "");
    if (raw === null) return null; // cancelled
    const trimmed = raw.trim();
    if (!trimmed) return null; // empty -> treat as cancel
    return trimmed;
  };

  const createFolder = async (parentId: string | null) => {
    if (!state.projectPath) return alert("Open or create a project first.");
    const name = promptName("New folder name?");
    if (name === null) return;
    await newFolder(state.projectPath, name, parentId);
    await refresh();
    if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
  };

  const createDoc = async (folderId: string | null) => {
    if (!state.projectPath) return alert("Open or create a project first.");
    const title = promptName("New document title?");
    if (title === null) return;
    const id = await newDoc(state.projectPath, title, folderId);
    await refresh();
    state.currentDocId = id;
    state.currentCharId = "";
    if (folderId) setExpanded((e) => ({ ...e, [folderId]: true }));
  };

  const createCharacterTab = async (folderId: string | null) => {
    if (!state.projectPath) return alert("Open or create a project first.");
    const name = promptName("New character name?");
    if (name === null) return;
    const id = await newCharacter(state.projectPath, name, folderId);
    await refresh();
    state.currentCharId = id;
    state.currentDocId = "";
    if (folderId) setExpanded((e) => ({ ...e, [folderId]: true }));
  };

  // ---------- Deletes ----------
  const requestDeleteFolder = (folderId: string) => {
    setPendingFolderId(folderId);
    setConfirmOpen(true);
  };

  const actuallyDeleteFolder = async (folderId: string) => {
    if (!state.projectPath) return alert("Open or create a project first.");
    try {
      // If your signature differs, adjust here:
      // e.g., await deleteFolderRecursive(state.projectPath, { folderId })
      await deleteFolderRecursive(state.projectPath, folderId);
      // Clear selections; deleted folder may include current doc/char
      state.currentDocId = "";
      state.currentCharId = "";
      await refresh();
    } catch (err) {
      console.error("Delete folder failed:", err);
      alert("Failed to delete folder. See console for details.");
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!state.projectPath) return alert("Open or create a project first.");
    try {
      await deleteDoc(state.projectPath, docId);
      if (state.currentDocId === docId) state.currentDocId = "";
      await refresh();
    } catch (err) {
      console.error("Delete doc failed:", err);
      alert("Failed to delete document. See console for details.");
    }
  };

  const handleDeleteCharacter = async (charId: string) => {
    if (!state.projectPath) return alert("Open or create a project first.");
    try {
      await deleteCharacter(state.projectPath, charId);
      if (state.currentCharId === charId) state.currentCharId = "";
      await refresh();
    } catch (err) {
      console.error("Delete character failed:", err);
      alert("Failed to delete character. See console for details.");
    }
  };

  // ---------- Context menu open/close ----------
  const openRootMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: { kind: "root" },
      visible: true,
    });
  };

  const openContextMenu = (e: React.MouseEvent, target: ContextTarget) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target,
      visible: true,
    });
  };

  const closeContextMenu = () =>
    setContextMenu((cm) => (cm.visible ? { ...cm, visible: false } : cm));

  // Close on outside click, scroll, resize, Esc (NO global 'contextmenu' close)
  useEffect(() => {
    if (!contextMenu.visible) return;

    const onMouseDown = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) {
        closeContextMenu();
      }
    };
    const onScroll = () => closeContextMenu();
    const onResize = () => closeContextMenu();
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeContextMenu();
    };

    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu.visible]);

  // ---------- Render ----------
  return (
    <nav
      aria-label="Project navigation"
      style={{ padding: "16px", position: "relative", userSelect: "none" }}
      onContextMenu={openRootMenu}   // right-click root
    >
      <TreeList
        nodes={rootNodes}
        expanded={expanded}
        onToggle={toggle}
        onCreateDoc={createDoc}
        onCreateFolder={createFolder}
        onCreateCharacter={createCharacterTab}
        onContextMenu={openContextMenu}
      />

      {rootNodes.length === 0 && (
        <p style={{ opacity: 0.7, marginTop: "12px" }}>
          <em>No items yet. Right-click to add content.</em>
        </p>
      )}

      {contextMenu.visible && (
        <ul
          ref={menuRef}
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
            listStyle: "none",
            margin: 0,
            padding: "6px 0",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "var(--shadow)",
            minWidth: 190,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Root menu: add-only */}
          {contextMenu.target.kind === "root" && (
            <>
              <MenuItem onClick={() => { createDoc(null); closeContextMenu(); }}>
                New document
              </MenuItem>
              <MenuItem onClick={() => { createFolder(null); closeContextMenu(); }}>
                New folder
              </MenuItem>
              <MenuItem onClick={() => { createCharacterTab(null); closeContextMenu(); }}>
                New character
              </MenuItem>
            </>
          )}

          {/* Folder menu: add + delete */}
          {contextMenu.target.kind === "folder" && (
            <>
              <MenuItem onClick={() => { createDoc(contextMenu.target.id); closeContextMenu(); }}>
                New document
              </MenuItem>
              <MenuItem onClick={() => { createFolder(contextMenu.target.id); closeContextMenu(); }}>
                New folder
              </MenuItem>
              <MenuItem onClick={() => { createCharacterTab(contextMenu.target.id); closeContextMenu(); }}>
                New character
              </MenuItem>
              <hr style={{ margin: "6px 0", border: 0, borderTop: "1px solid var(--border)" }} />
              <MenuItem
                onClick={() => {
                  requestDeleteFolder(contextMenu.target.id);
                  closeContextMenu();
                }}
              >
                Delete folder…
              </MenuItem>
            </>
          )}

          {/* Doc menu: delete */}
          {contextMenu.target.kind === "doc" && (
            <>
              <MenuItem
                onClick={() => {
                  handleDeleteDoc(contextMenu.target.id);
                  closeContextMenu();
                }}
              >
                Delete document
              </MenuItem>
            </>
          )}

          {/* Character menu: delete */}
          {contextMenu.target.kind === "character" && (
            <>
              <MenuItem
                onClick={() => {
                  handleDeleteCharacter(contextMenu.target.id);
                  closeContextMenu();
                }}
              >
                Delete character
              </MenuItem>
            </>
          )}
        </ul>
      )}

      {/* Required folder warning */}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Folder"
        message={'Are you sure you want to delete this folder and all of its contents?'}
        confirmText="Delete"
        cancelText="Cancel"
        onClose={(confirmed) => {
          setConfirmOpen(false);
          if (confirmed && pendingFolderId) {
            void actuallyDeleteFolder(pendingFolderId);
          }
          setPendingFolderId(null);
        }}
      />
    </nav>
  );
}

function MenuItem(props: { children: React.ReactNode; onClick: () => void }) {
  return (
    <li
      role="menuitem"
      style={{ padding: "8px 14px", cursor: "pointer" }}
      onClick={props.onClick}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick();
        }
      }}
      tabIndex={0}
    >
      {props.children}
    </li>
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
      const an =
        a.kind === "folder" ? a.name : a.kind === "doc" ? (a as any).title : (a as any).name;
      const bn =
        b.kind === "folder" ? b.name : b.kind === "doc" ? (b as any).title : (b as any).name;
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
  onContextMenu: (e: React.MouseEvent, target: ContextTarget) => void;
  depth?: number;
}) {
  const {
    nodes,
    expanded,
    onToggle,
    onCreateDoc,
    onCreateFolder,
    onCreateCharacter,
    onContextMenu,
    depth = 0,
  } = props;
  const snap = useSnapshot(state);

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
          <li
            key={n.id}
            style={{ marginBottom: "8px" }}
            onContextMenu={(e) => onContextMenu(e, { kind: "folder", id: n.id })}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
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
            </div>

            {expanded[n.id] && n.children.length > 0 && (
              <TreeList
                nodes={n.children}
                expanded={expanded}
                onToggle={onToggle}
                onCreateDoc={onCreateDoc}
                onCreateFolder={onCreateFolder}
                onCreateCharacter={onCreateCharacter}
                onContextMenu={onContextMenu}
                depth={depth + 1}
              />
            )}
          </li>
        ) : n.kind === "doc" ? (
          <li
            key={n.id}
            style={{
              marginBottom: "6px",
              paddingLeft: "20px",
              background: snap.currentDocId === n.id ? "rgba(0,0,0,0.06)" : undefined,
              borderRadius: snap.currentDocId === n.id ? 6 : undefined,
            }}
            onContextMenu={(e) => onContextMenu(e, { kind: "doc", id: n.id })}
          >
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
          <li
            key={n.id}
            style={{
              marginBottom: "6px",
              paddingLeft: "20px",
              background: snap.currentCharId === n.id ? "rgba(0,0,0,0.06)" : undefined,
              borderRadius: snap.currentCharId === n.id ? 6 : undefined,
            }}
            onContextMenu={(e) => onContextMenu(e, { kind: "character", id: n.id })}
          >
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
