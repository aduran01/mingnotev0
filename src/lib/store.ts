import { proxy } from "valtio";


export type Doc = { id:string; title:string; folderId:string|null };
export type Folder = { id:string; name:string; parentId:string|null };


export const state = proxy({
projectPath: "",
currentDocId: "",
docs: [] as Doc[],
folders: [] as Folder[],
editor: { md: "", lastSaved: 0 },
search: { q:"", results: [] as Array<{id:string; snippet:string}> },
});