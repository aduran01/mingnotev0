import { invoke } from "@tauri-apps/api/core";


export const openProject = (dir:string) => invoke<string>("open_project", { dir });
export const createProject = (dir:string, name:string) => invoke<string>("create_project", { dir, name });
export const listTree = (projectPath:string) => invoke<{docs:any[];folders:any[]}>("list_tree", { projectPath });
export const loadDoc = (projectPath:string, docId:string) => invoke<string>("load_document", { projectPath, docId });
export const saveDoc = (projectPath:string, docId:string, markdown:string) => invoke("save_document", { projectPath, docId, markdown });
export const newDoc = (projectPath:string, title:string, folderId?:string|null) => invoke<string>("create_document", { projectPath, title, folderId: folderId||null });
export const newFolder = (projectPath:string, name:string, parentId?:string|null) => invoke<string>("create_folder", { projectPath, name, parentId: parentId||null });
export const doSearch = (projectPath:string, q:string) => invoke<Array<[string,string]>>("search", { projectPath, q });
export const snapshotDoc = (projectPath:string, docId:string, note:string) => invoke("create_snapshot", { projectPath, docId, note });
export const backupProject = (projectPath:string) => invoke("backup_project", { projectPath });