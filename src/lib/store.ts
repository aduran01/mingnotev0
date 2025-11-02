import { proxy } from "valtio";

export type Doc = { id: string; title: string; folderId: string | null };
export type Folder = { id: string; name: string; parentId: string | null };
export type Character = { id: string; name: string; folderId: string | null };
export type Attribute = { key: string; value: string };

export const state = proxy({
  projectPath: "",
  currentDocId: "",
  currentCharId: "",

  docs: [] as Doc[],
  folders: [] as Folder[],
  characters: [] as Character[],

  // Editor state: added formatting fields
  editor: {
    md: "",
    lastSaved: 0,
    font: "Arial",
    fontSize: 14,
    lineHeight: 1.6,
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    highlightColor: "", // note background color
    fontColor: "",      // note text color
    align: "left",      // "left" | "center" | "right"
    showCharCount: false,
  },

  // Character editor unchanged
  charEditor: {
    age: "",
    nationality: "",
    sexuality: "",
    height: "",
    attributes: [] as Attribute[],
    image: "",
    lastSaved: 0,
  },

  search: {
    q: "",
    results: [] as Array<{ id: string; snippet: string }>,
  },
});
