import { proxy } from "valtio";

/**
 * Global application state used by both the document editor and character
 * editor.  It mirrors the structure of the original MingNote codebase
 * and exposes reactive properties that components subscribe to via
 * `valtio` snapshots.
 */

// Basic entity types representing documents, folders and characters
export type Doc = { id: string; title: string; folderId: string | null };
export type Folder = { id: string; name: string; parentId: string | null };
export type Character = { id: string; name: string; folderId: string | null };
export type Attribute = { key: string; value: string };

/**
 * `state` is a Valtio proxy that holds all mutable application data.  The
 * editor objects store formatting options as well as the current
 * Markdown content.  A new `showCharCount` boolean controls whether
 * the character counter is visible; it can be toggled from the UI
 * (see WordCounter.onClick handler).
 */
export const state = proxy({
  // Root directory of the currently open project on disk
  projectPath: "",
  // ID of the currently open document; empty when no doc is selected
  currentDocId: "",
  // ID of the currently edited character (if any).  When set, the
  // CharacterEditor component is rendered instead of the Markdown editor.
  currentCharId: "",

  // Collections of entities; these are populated via IPC calls
  docs: [] as Doc[],
  folders: [] as Folder[],
  characters: [] as Character[],

  // Editor state: includes the document content and formatting options
  editor: {
    md: "",            // raw Markdown text for the document
    lastSaved: 0,       // timestamp of the last autosave
    font: "Arial",      // default font family
    fontSize: 14,       // base font size in pixels
    lineHeight: 1.6,    // line height multiplier
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    highlightColor: "", // background colour used for highlights
    fontColor: "",      // text colour used when applying colour
    align: "left",       // text alignment: left, center or right
    showCharCount: false, // whether the character count popup is visible
  },

  // Character editor state; persists profile fields and image paths
  charEditor: {
    age: "",
    nationality: "",
    sexuality: "",
    height: "",
    attributes: [] as Attribute[],
    image: "",
    lastSaved: 0,
  },

  // Search state for the file tree/search UI
  search: {
    q: "",
    results: [] as Array<{ id: string; snippet: string }>,
  },
});