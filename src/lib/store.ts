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

  // Added showCharCount to control visibility of the character counter.
  editor: {
    md: "",
    lastSaved: 0,
    font: "Arial",
    lineHeight: 1.6,
    showCharCount: false,
  },

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
