#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod fs_utils;

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      commands::create_project,
      commands::open_project,
      commands::list_tree,
      commands::create_document,
      commands::create_folder,
      commands::load_document,
      commands::save_document,
      commands::search,
      commands::create_snapshot,
      commands::backup_project,
      commands::create_character,
      commands::load_character,
      commands::save_character,
      commands::import_character_image,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}