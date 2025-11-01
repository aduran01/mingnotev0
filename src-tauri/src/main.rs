// src-tauri/src/main.rs

#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod commands;
mod db;
mod fs_utils;

// If you prefer, you can explicitly import the commands you expose.
// This helps catch typos at compile-time and keeps generate_handler! tidy.
use commands::{
  backup_project,
  create_character,
  create_document,
  create_folder,
  create_project,
  create_snapshot,
  delete_character,
  delete_doc,
  delete_folder_recursive,
  import_character_image,
  list_tree,
  load_character,
  load_document,
  open_project,
  save_character,
  save_document,
  search,
};

fn main() {
  tauri::Builder::default()
    // Dialog plugin is great for native alerts/toasts — keep as-is.
    .plugin(tauri_plugin_dialog::init())
    // If you later add more plugins (e.g., shell/fs/path), chain them here.

    // Register every IPC command exposed to the frontend.
    .invoke_handler(tauri::generate_handler![
      // Project lifecycle
      create_project,
      open_project,
      backup_project,

      // Tree & content CRUD
      list_tree,
      create_folder,
      create_document,
      create_character,

      // Load/save content
      load_document,
      save_document,
      load_character,
      save_character,
      import_character_image,

      // Search/snapshots
      search,
      create_snapshot,

      // **Deletions** (required for Section B)
      // - delete_folder_recursive: removes a folder and ALL nested content
      // - delete_doc: deletes a single document
      // - delete_character: deletes a single character (file or dir, depending on your impl)
      delete_folder_recursive,
      delete_doc,
      delete_character
    ])
    // Optional: do any runtime checks or logging here.
    // .setup(|_app| { Ok(()) })

    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
