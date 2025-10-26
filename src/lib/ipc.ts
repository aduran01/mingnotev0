import { invoke } from "@tauri-apps/api/core";

// Wrapper around Tauri invoke that sends both camelCase and snake_case
// arguments.  Tauri v2 no longer auto‑converts camelCase names, so
// sending both ensures the Rust commands get the values they expect.

export const openProject = (dir: string) =>
  invoke<string>("open_project", { dir });

export const createProject = (dir: string, name: string) =>
  invoke<string>("create_project", { dir, name });

// Fetch folder & document tree.  Sends both projectPath and project_path.
export const listTree = (projectPath: string) =>
  invoke<{ docs: any[]; folders: any[] }>("list_tree", {
    projectPath,
    project_path: projectPath,
  });

// Load a document by ID
export const loadDoc = (projectPath: string, docId: string) =>
  invoke<string>("load_document", {
    projectPath,
    project_path: projectPath,
    docId,
    doc_id: docId,
  });

// Save Markdown for a document
export const saveDoc = (
  projectPath: string,
  docId: string,
  markdown: string,
) =>
  invoke("save_document", {
    projectPath,
    project_path: projectPath,
    docId,
    doc_id: docId,
    markdown,
  });

// Create a new document
export const newDoc = (
  projectPath: string,
  title: string,
  folderId?: string | null,
) => {
  const folderValue = folderId ?? null;
  return invoke<string>("create_document", {
    projectPath,
    project_path: projectPath,
    title,
    folderId: folderValue,
    folder_id: folderValue,
  });
};

// Create a new folder
export const newFolder = (
  projectPath: string,
  name: string,
  parentId?: string | null,
) => {
  const parentValue = parentId ?? null;
  return invoke<string>("create_folder", {
    projectPath,
    project_path: projectPath,
    name,
    parentId: parentValue,
    parent_id: parentValue,
  });
};

// Free‑text search
export const doSearch = (projectPath: string, q: string) =>
  invoke<Array<[string, string]>>("search", {
    projectPath,
    project_path: projectPath,
    q,
  });

// Snapshot a document
export const snapshotDoc = (
  projectPath: string,
  docId: string,
  note: string,
) =>
  invoke("create_snapshot", {
    projectPath,
    project_path: projectPath,
    docId,
    doc_id: docId,
    note,
  });

// Back up the project database and MD files
export const backupProject = (projectPath: string) =>
  invoke("backup_project", {
    projectPath,
    project_path: projectPath,
  });
