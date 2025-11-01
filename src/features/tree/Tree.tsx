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

// Local types
type Folder = { id: string; name: string; parentId: string | null };
type Doc = { id: string; title: string; folderId: string | null };
type Character = { id: string; name: string; folderId: string | null };

const ROOT_KEY = "__ROOT__";
const keyOf = (id: string | null): string => id ?? ROOT_KEY;

type TreeNode =
  | { kind: "folder"; id: string; name: string; children: TreeNode[] }
  | { kind: "doc"; id: string; title: string }
  | { kind: "character"; id: string; name: string };

type ContextTarget =
  | { kind: "root" }
  | { kind: "folder"; id: string }
  | { kind: "doc"; id: string }
  | { kind: "character"; id: string };

export default function Tree() {
  const snap = useSnapshot(state);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ContextTarget;
    visible: boolean;
  }>({ x: 0, y: 0, target: { kind: "root" }, visible: false });

  // Confirm dialog for folder deletion
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFolderId, setPendingFolderId] = useState<string | null>(null);

  const menuRef = useRef<HTMLUListElement | null>(null);

  const closeContextMenu = () =>
    setContextMenu((cm) => (cm.visible ? { ...cm, visible: false } : cm));

  const refresh = useCallback(async () => {
    if (!state.projectPath) return;
    const { folders: f, docs: d, characters: c } = await listTree(state.projectPath);
    setFolders(f as Folder[]);
    setDocs(d as Doc[]);
    setCharacters((c || []) as Character[]);
    state.folders = f as Folder[];
    state.docs = d as Doc[];
    state.characters = (c || []) as Character[];
    // ensure any stray menu is gone after refresh
    closeContextMenu();
  }, []);

  useEffect(() => {
    if (snap.projectPath) refresh();
  }, [snap.projectPath, refresh]);

  const rootNodes = useMemo(
    () => buildTree(folders, docs, characters),
    [folders, docs, characters]
  );

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // --- Selections & actions ---
  const selectDoc = (id: string) => {
    state.currentDocId = id;
    state.currentCharId = "";
  };
  const selectChar = (id: string) => {
    state.currentCharId = id;
    state.currentDocId = "";
  };
  const selectFolder = (id: string) => {
    // optional: you can store a currentFolderId if you want folder highlighting
    // (not strictly required)
  };

  // Prompt helper
  const promptName = (message: string) => {
    const raw = window.prompt(message, "");
    if (raw === null) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
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
    selectDoc(id);
    if (folderId) setExpanded((e) => ({ ...e, [folderId]: true }));
  };

  const createCharacterTab = async (folderId: string | null) => {
    if (!state.projectPath) return alert("Open or create a project first.");
    const name = promptName("New character name?");
    if (name === null) return;
    const id = await newCharacter(state.projectPath, name, folderId);
    await refresh();
    selectChar(id);
    if (folderId) setExpanded((e) => ({ ...e, [folderId]: true }));
  };

  // --- Deletions ---
  const requestDeleteFolder = (folderId: string) => {
    setPendingFolderId(folderId);
    setConfirmOpen(true);
  };

  const actuallyDeleteFolder = async (folderId: string) => {
    if (!state.projectPath) return alert("Open or create a project first.");
    try {
      await deleteFolderRecursive(state.projectPath, folderId);
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

  // --- Context menu wiring ---
  // Root menu: only open if the right-click did NOT happen on a tree item
  const openRootMenu = (e: React.MouseEvent) => {
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest("[data-tree-item]")) {
      // An item will handle its own context menu
      return;
    }
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

  // Close on outside click / scroll / resize / Esc
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

  // Pre-narrowed helpers for current context target (to avoid TS issues)
  const cmTarget = contextMenu.target;
  const isFolderTarget = cmTarget.kind === "folder";
  const isDocTarget = cmTarget.kind === "doc";
  const isCharTarget = cmTarget.kind === "character";
  const folderId = isFolderTarget ? cmTarget.id : null;
  const docId = isDocTarget ? cmTarget.id : null;
  const charId = isCharTarget ? cmTarget.id : null;

  return (
    <nav
      aria-label="Project navigation"
      style={{ padding: "16px", position: "relative", userSelect: "none" }}
      onContextMenu={openRootMenu}
    >
      <TreeList
        nodes={rootNodes}
        expanded={expanded}
        onToggle={toggle}
        onCreateDoc={createDoc}
        onCreateFolder={createFolder}
        onCreateCharacter={createCharacterTab}
        onContextMenu={openContextMenu}
        onSelectDoc={selectDoc}
        onSelectChar={selectChar}
        onSelectFolder={selectFolder}
        currentDocId={snap.currentDocId}
        currentCharId={snap.currentCharId}
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
          {cmTarget.kind === "root" && (
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
          {isFolderTarget && (
            <>
              <MenuItem onClick={() => { createDoc(folderId); closeContextMenu(); }}>
                New document
              </MenuItem>
              <MenuItem onClick={() => { createFolder(folderId); closeContextMenu(); }}>
                New folder
              </MenuItem>
              <MenuItem onClick={() => { createCharacterTab(folderId); closeContextMenu(); }}>
                New character
              </MenuItem>
              <hr style={{ margin: "6px 0", border: 0, borderTop: "1px solid var(--border)" }} />
              <MenuItem
                onClick={() => {
                  if (folderId) requestDeleteFolder(folderId);
                  closeContextMenu();
                }}
              >
                Delete folder…
              </MenuItem>
            </>
          )}

          {/* Doc menu: delete */}
          {isDocTarget && (
            <>
              <MenuItem onClick={() => { if (docId) handleDeleteDoc(docId); closeContextMenu(); }}>
                Delete document
              </MenuItem>
            </>
          )}

          {/* Character menu: delete */}
          {isCharTarget && (
            <>
              <MenuItem onClick={() => { if (charId) handleDeleteCharacter(charId); closeContextMenu(); }}>
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
        message={"Are you sure you want to delete this folder and all of its contents?"}
        confirmText="Delete"
        cancelText="Cancel"
        onClose={(confirmed) => {
          setConfirmOpen(false);
          if (confirmed && pendingFolderId) void actuallyDeleteFolder(pendingFolderId);
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

function TreeList(props: {
  nodes: TreeNode[];
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onCreateDoc: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onCreateCharacter: (folderId: string | null) => void;
  onContextMenu: (e: React.MouseEvent, target: ContextTarget) => void;
  onSelectDoc: (id: string) => void;
  onSelectChar: (id: string) => void;
  onSelectFolder: (id: string) => void;
  currentDocId: string;
  currentCharId: string;
  depth?: number;
}) {
  const {
    nodes, expanded, onToggle,
    onCreateDoc, onCreateFolder, onCreateCharacter,
    onContextMenu, onSelectDoc, onSelectChar, onSelectFolder,
    currentDocId, currentCharId,
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
      {nodes.map((n) => {
        if (n.kind === "folder") {
          const isOpen = !!expanded[n.id];
          const isActive = false; // set true if you track currentFolderId
          return (
            <li
              key={n.id}
              data-tree-item
              style={{ marginBottom: 8 }}
              onContextMenu={(e) => onContextMenu(e, { kind: "folder", id: n.id })}
            >
              <div
                data-tree-item
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: isActive ? "var(--accent-subtle, rgba(0,0,0,.06))" : "transparent",
                  borderRadius: 6,
                  padding: "2px 4px",
                }}
              >
                <FolderCaret isOpen={isOpen} onClick={() => onToggle(n.id)} />
                <span
                  data-tree-item
                  style={{ cursor: "pointer", fontWeight: 600 }}
                  onDoubleClick={() => onToggle(n.id)}
                  onClick={() => { onToggle(n.id); onSelectFolder(n.id); }}
                  onContextMenu={(e) => onContextMenu(e, { kind: "folder", id: n.id })}
                >
                  {n.name}
                </span>
              </div>

              {isOpen && (
                <TreeList
                  nodes={n.children}
                  expanded={expanded}
                  onToggle={onToggle}
                  onCreateDoc={onCreateDoc}
                  onCreateFolder={onCreateFolder}
                  onCreateCharacter={onCreateCharacter}
                  onContextMenu={onContextMenu}
                  onSelectDoc={onSelectDoc}
                  onSelectChar={onSelectChar}
                  onSelectFolder={onSelectFolder}
                  currentDocId={currentDocId}
                  currentCharId={currentCharId}
                  depth={depth + 1}
                />
              )}
            </li>
          );
        }

        if (n.kind === "doc") {
          const isActive = currentDocId === n.id;
          return (
            <li
              key={n.id}
              data-tree-item
              onContextMenu={(e) => onContextMenu(e, { kind: "doc", id: n.id })}
              style={{ marginBottom: 6, cursor: "default" }}
            >
              <button
                data-tree-item
                type="button"
                onClick={() => onSelectDoc(n.id)}
                onContextMenu={(e) => onContextMenu(e, { kind: "doc", id: n.id })}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: isActive ? "var(--accent-subtle, rgba(0,0,0,.06))" : "transparent",
                  border: "none",
                  padding: "2px 6px",
                  borderRadius: 6,
                  font: "inherit",
                  color: "inherit",
                }}
              >
                {n.title}
              </button>
            </li>
          );
        }

        // character
        const isActive = currentCharId === n.id;
        return (
          <li
            key={n.id}
            data-tree-item
            onContextMenu={(e) => onContextMenu(e, { kind: "character", id: n.id })}
            style={{ marginBottom: 6, cursor: "default" }}
          >
            <button
              data-tree-item
              type="button"
              onClick={() => onSelectChar(n.id)}
              onContextMenu={(e) => onContextMenu(e, { kind: "character", id: n.id })}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: isActive ? "var(--accent-subtle, rgba(0,0,0,.06))" : "transparent",
                border: "none",
                padding: "2px 6px",
                borderRadius: 6,
                font: "inherit",
                color: "inherit",
              }}
            >
              {n.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FolderCaret(props: { isOpen: boolean; onClick: () => void }) {
  const { isOpen, onClick } = props;
  return (
    <button
      type="button"
      aria-label={isOpen ? "Collapse folder" : "Expand folder"}
      onClick={onClick}
      style={{
        width: 18,
        height: 18,
        border: "1px solid var(--border)",
        borderRadius: 4,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--card)",
        cursor: "pointer",
      }}
    >
      {isOpen ? "▾" : "▸"}
    </button>
  );
}

// Build a nested tree from flat rows
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
    (d) => ({ kind: "doc", id: d.id, title: d.title }) as TreeNode
  );
  const rootChars = (charsByFolder[ROOT_KEY] || []).map(
    (c) => ({ kind: "character", id: c.id, name: c.name }) as TreeNode
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
