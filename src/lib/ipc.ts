import { invoke } from "@tauri-apps/api/core";

// Project
export const openProject = (dir: string) => invoke<string>("open_project", { dir });
export const createProject = (dir: string, name: string) =>
  invoke<string>("create_project", { dir, name });

// Tree (folders + docs + characters)
export const listTree = (projectPath: string) =>
  invoke<{ docs: any[]; folders: any[]; characters?: any[] }>("list_tree", {
    projectPath,
    project_path: projectPath,
  });

// Docs
export const loadDoc = (projectPath: string, docId: string) =>
  invoke<string>("load_document", {
    projectPath,
    project_path: projectPath,
    docId,
    doc_id: docId,
  });

export const saveDoc = (projectPath: string, docId: string, markdown: string) =>
  invoke("save_document", {
    projectPath,
    project_path: projectPath,
    docId,
    doc_id: docId,
    markdown,
  });

export const newDoc = (projectPath: string, title: string, folderId?: string | null) => {
  const folderValue = folderId ?? null;
  return invoke<string>("create_document", {
    projectPath,
    project_path: projectPath,
    title,
    folderId: folderValue,
    folder_id: folderValue,
  });
};

//folder deletion functions
export async function deleteFolderRecursive(absPath: string) {
  // absPath should be the absolute or app-root-relative path MingNote uses
  return invoke("delete_folder_recursive", { absPath });
}

export async function deleteDoc(absPath: string) {
  return invoke("delete_doc", { absPath });
}

export async function deleteCharacter(absPath: string) {
  return invoke("delete_character", { absPath });
}

// Folders
export const newFolder = (projectPath: string, name: string, parentId?: string | null) => {
  const parentValue = parentId ?? null;
  return invoke<string>("create_folder", {
    projectPath,
    project_path: projectPath,
    name,
    parentId: parentValue,
    parent_id: parentValue,
  });
};

// Search
export const doSearch = (projectPath: string, q: string) =>
  invoke<Array<[string, string]>>("search", { projectPath, project_path: projectPath, q });

// Snapshots / backup
export const snapshotDoc = (projectPath: string, docId: string, note: string) =>
  invoke("create_snapshot", {
    projectPath,
    project_path: projectPath,
    docId,
    doc_id: docId,
    note,
  });

export const backupProject = (projectPath: string) =>
  invoke("backup_project", { projectPath, project_path: projectPath });

// ------------------ Characters ------------------

export const newCharacter = (projectPath: string, name: string, folderId?: string | null) => {
  const folderValue = folderId ?? null;
  return invoke<string>("create_character", {
    projectPath,
    project_path: projectPath,
    name,
    folderId: folderValue,
    folder_id: folderValue,
  });
};

export const loadCharacter = (projectPath: string, charId: string) =>
  invoke<any>("load_character", {
    projectPath,
    project_path: projectPath,
    charId,
    char_id: charId,
  });

export const saveCharacter = (projectPath: string, charId: string, data: any) =>
  invoke("save_character", {
    projectPath,
    project_path: projectPath,
    charId,
    char_id: charId,
    data,
  });

  // Import a file into the project's character assets folder; returns absolute dest path
export const importCharacterImage = (
  projectPath: string,
  charId: string,
  sourcePath: string
) =>
  invoke<string>("import_character_image", {
    projectPath,
    project_path: projectPath, // keep both keys for safety
    charId,
    char_id: charId,
    sourcePath,
    source_path: sourcePath,
  });
