use std::path::Path;

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;

use crate::db::{run_migrations, select_docs, select_folders, select_chars};
use crate::fs_utils::atomic_write;

// ------- Types
#[derive(Serialize, Deserialize)]
pub struct Doc { pub id: String, pub title: String, pub folder_id: Option<String> }

#[derive(Serialize, Deserialize)]
pub struct Folder { pub id: String, pub name: String, pub parent_id: Option<String> }

// ------- Helpers
fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ns = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("d{}", ns)
}

fn mirror_md(project_path: &str, doc_id: &str, md: &str) -> Result<(), String> {
    let path = Path::new(project_path).join("md").join(format!("{doc_id}.md"));
    atomic_write(&path, md.as_bytes()).map_err(|e| e.to_string())
}

// Remove a document row and its markdown file.
fn delete_doc_internal(
    conn: &mut Connection,
    project_path: &str,
    doc_id: &str,
) -> Result<(), String> {
    // Delete from DB (Body is removed via ON DELETE CASCADE).
    conn.execute("DELETE FROM Document WHERE id=?", params![doc_id])
        .map_err(|e| e.to_string())?;
    // Remove the markdown file if it exists.
    let md_path = Path::new(project_path).join("md").join(format!("{doc_id}.md"));
    let _ = fs::remove_file(&md_path);
    Ok(())
}

// Remove a character row and its asset directory.
fn delete_character_internal(
    conn: &mut Connection,
    project_path: &str,
    char_id: &str,
) -> Result<(), String> {
    conn.execute("DELETE FROM Character WHERE id=?", params![char_id])
        .map_err(|e| e.to_string())?;
    let dir = Path::new(project_path)
        .join("assets")
        .join("characters")
        .join(char_id);
    let _ = fs::remove_dir_all(&dir);
    Ok(())
}

#[tauri::command]
pub fn delete_doc(project_path: String, doc_id: String) -> Result<(), String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    delete_doc_internal(&mut conn, &project_path, &doc_id)
}

#[tauri::command]
pub fn delete_character(project_path: String, char_id: String) -> Result<(), String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    delete_character_internal(&mut conn, &project_path, &char_id)
}

#[tauri::command]
pub fn delete_folder_recursive(
    project_path: String,
    folder_id: String,
) -> Result<(), String> {
    use std::path::Path;
    use rusqlite::{params, Connection};

    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    // 1) Collect all descendant folder ids (BFS). Scope statements so they drop.
    let mut to_delete = vec![folder_id.clone()];
    let mut idx = 0;
    while idx < to_delete.len() {
        let current = to_delete[idx].clone();
        idx += 1;

        // Scope ensures `st` and its iterator drop before next use of &mut conn
        let child_ids: Vec<String> = {
            let mut st = conn
                .prepare("SELECT id FROM Folder WHERE parent_id=?")
                .map_err(|e| e.to_string())?;
            let rows = st
                .query_map([current], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            rows.filter_map(Result::ok).collect()
        };

        to_delete.extend(child_ids);
    }

    // 2) For each folder, delete its docs (collect first, then mutate).
    for fid in &to_delete {
        let doc_ids: Vec<String> = {
            let mut st = conn
                .prepare("SELECT id FROM Document WHERE folder_id=?")
                .map_err(|e| e.to_string())?;
            let rows = st
                .query_map([fid.clone()], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            rows.filter_map(Result::ok).collect()
        };

        for doc_id in doc_ids {
            // now it's safe to mutably borrow `conn`
            delete_doc_internal(&mut conn, &project_path, &doc_id)?;
        }

        // 3) Delete characters in this folder (same pattern).
        let char_ids: Vec<String> = {
            let mut stc = conn
                .prepare("SELECT id FROM Character WHERE folder_id=?")
                .map_err(|e| e.to_string())?;
            let rows = stc
                .query_map([fid.clone()], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            rows.filter_map(Result::ok).collect()
        };

        for char_id in char_ids {
            delete_character_internal(&mut conn, &project_path, &char_id)?;
        }
    }

    // 4) Delete folders themselves (leaves first is safest).
    for fid in to_delete.into_iter().rev() {
        conn.execute("DELETE FROM Folder WHERE id=?", params![fid])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}


// ------- Commands

#[tauri::command]
pub fn create_project(dir: String, name: String) -> Result<String, String> {
    let base = Path::new(&dir).join(&name);
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(base.join("md")).ok();
    std::fs::create_dir_all(base.join("backups")).ok();

    let dbp = base.join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    run_migrations(&mut conn).map_err(|e| e.to_string())?;

    Ok(base.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_project(dir: String) -> Result<String, String> { Ok(dir) }

#[tauri::command]
pub fn list_tree(project_path: String) -> Result<serde_json::Value, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let docs = select_docs(&conn).map_err(|e| e.to_string())?;
    let folders = select_folders(&conn).map_err(|e| e.to_string())?;
    let chars = select_chars(&conn).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "docs": docs, "folders": folders, "characters": chars }))
}

#[tauri::command]
pub fn create_document(project_path: String, title: String, folder_id: Option<String>) -> Result<String, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let id = new_id();
    conn.execute(
        "INSERT INTO Document(id, project_id, folder_id, title) VALUES(?, 'p1', ?, ?)",
        params![id, folder_id, title],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO Body(document_id, markdown) VALUES(?, '# New Document')",
        params![id],
    ).map_err(|e| e.to_string())?;

    mirror_md(&project_path, &id, "# New Document")?;
    Ok(id)
}

#[tauri::command]
pub fn create_folder(project_path: String, name: String, parent_id: Option<String>) -> Result<String, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let id = new_id();
    conn.execute(
        "INSERT INTO Folder(id, project_id, parent_id, name) VALUES(?, 'p1', ?, ?)",
        params![id, parent_id, name],
    ).map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn load_document(project_path: String, doc_id: String) -> Result<String, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let mut st = conn.prepare("SELECT markdown FROM Body WHERE document_id=?").map_err(|e| e.to_string())?;
    let md: String = st.query_row([doc_id], |r| r.get(0)).map_err(|e| e.to_string())?;
    Ok(md)
}

#[tauri::command]
pub fn save_document(project_path: String, doc_id: String, markdown: String) -> Result<(), String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE Body SET markdown=?, updated_at=CURRENT_TIMESTAMP WHERE document_id=?",
        params![markdown, doc_id],
    ).map_err(|e| e.to_string())?;

    mirror_md(&project_path, &doc_id, &markdown)?;
    Ok(())
}

#[tauri::command]
pub fn search(project_path: String, q: String) -> Result<Vec<(String, String)>, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let mut st = conn.prepare(
        "SELECT Document.id, snippet(body_fts, -1, '<b>','</b>','…', 12)
         FROM body_fts
         JOIN Body ON body_fts.rowid = Body.rowid
         JOIN Document ON Body.document_id = Document.id
         WHERE body_fts MATCH ?
         LIMIT 50",
    ).map_err(|e| e.to_string())?;

    let rows = st.query_map([q], |row| Ok((row.get(0)?, row.get(1)?))).map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn create_snapshot(project_path: String, doc_id: String, note: String) -> Result<(), String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let md: String = conn.query_row("SELECT markdown FROM Body WHERE document_id=?", [doc_id.clone()], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let id = new_id();
    conn.execute(
        "INSERT INTO Snapshot(id, document_id, note, markdown) VALUES(?,?,?,?)",
        params![id, doc_id, note, md],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn backup_project(project_path: String) -> Result<(), String> {
    use std::io::Write;

    let ts = Utc::now().format("%Y%m%d_%H%M%S");
    let backup_path = Path::new(&project_path).join("backups").join(format!("backup_{ts}.zip"));

    let mut zipw = zip::ZipWriter::new(std::fs::File::create(&backup_path).map_err(|e| e.to_string())?);
    let opts = zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let dbp = Path::new(&project_path).join("project.db");
    zipw.start_file("project.db", opts).map_err(|e| e.to_string())?;
    let db_bytes = std::fs::read(&dbp).map_err(|e| e.to_string())?;
    zipw.write_all(&db_bytes).map_err(|e| e.to_string())?;

    let md_dir = Path::new(&project_path).join("md");
    if md_dir.exists() {
        for entry in walkdir::WalkDir::new(&md_dir).into_iter().flatten().filter(|e| e.file_type().is_file()) {
            let rel = entry.path().strip_prefix(&project_path).unwrap();
            zipw.start_file(rel.to_string_lossy(), opts).map_err(|e| e.to_string())?;
            let bytes = std::fs::read(entry.path()).map_err(|e| e.to_string())?;
            zipw.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }

    zipw.finish().map_err(|e| e.to_string())?;
    Ok(())
}

// ----------------- Characters

#[tauri::command]
pub fn create_character(project_path: String, name: String, folder_id: Option<String>) -> Result<String, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    let id = new_id();
    conn.execute(
        "INSERT INTO Character(id, project_id, folder_id, name, age, nationality, sexuality, height, attributes, image_path)
         VALUES(?, 'p1', ?, ?, '', '', '', '', '[]', '')",
        params![id, folder_id, name],
    ).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn load_character(project_path: String, char_id: String) -> Result<serde_json::Value, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    let mut st = conn.prepare(
        "SELECT name, folder_id, age, nationality, sexuality, height, attributes, image_path
         FROM Character WHERE id=?",
    ).map_err(|e| e.to_string())?;
    let result = st.query_row([char_id.clone()], |r| {
        Ok(serde_json::json!({
            "id": char_id,
            "name": r.get::<_, String>(0)?,
            "folderId": r.get::<_, Option<String>>(1)?,
            "age": r.get::<_, Option<String>>(2)?,
            "nationality": r.get::<_, Option<String>>(3)?,
            "sexuality": r.get::<_, Option<String>>(4)?,
            "height": r.get::<_, Option<String>>(5)?,
            "attributes": r.get::<_, Option<String>>(6)?,
            "image": r.get::<_, Option<String>>(7)?,
        }))
    }).map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub fn save_character(project_path: String, char_id: String, data: serde_json::Value) -> Result<(), String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let age = data.get("age").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let nationality = data.get("nationality").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let sexuality = data.get("sexuality").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let height = data.get("height").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let attributes_value = match data.get("attributes") {
        Some(v) => if v.is_string() { v.as_str().unwrap_or("").to_string() }
                   else { serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()) },
        None => "[]".to_string(),
    };
    let image = data.get("image").and_then(|v| v.as_str()).unwrap_or("").to_string();

    conn.execute(
        "UPDATE Character
         SET age=?, nationality=?, sexuality=?, height=?, attributes=?, image_path=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?",
        params![age, nationality, sexuality, height, attributes_value, image, char_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_character_image(
    project_path: String,
    char_id: String,
    source_path: String,
) -> Result<String, String> {
    use std::fs;
    use std::path::{Path, PathBuf};

    if source_path.trim().is_empty() {
        return Err("source_path is empty".into());
    }

    let src = Path::new(&source_path);
    if !src.exists() || !src.is_file() {
        return Err("source file does not exist".into());
    }

    // destination: PROJECT/assets/characters/<char_id>/<filename>
    let dest_dir = Path::new(&project_path)
        .join("assets")
        .join("characters")
        .join(&char_id);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let filename = src.file_name().ok_or("invalid filename")?;
    let dest_path: PathBuf = dest_dir.join(filename);

    // copy (overwrite if same name already exists)
    fs::copy(&src, &dest_path).map_err(|e| e.to_string())?;

    Ok(dest_path.to_string_lossy().to_string())
}

