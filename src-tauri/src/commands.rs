use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::db::{run_migrations, select_docs, select_folders};
use crate::fs_utils::atomic_write;

// ---------- Types ----------
#[derive(Serialize, Deserialize)]
pub struct Doc {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

// ---------- Helpers ----------
fn new_id() -> String {
    // simple unique-ish id; replace with uuid crate later if you like
    use std::time::{SystemTime, UNIX_EPOCH};
    let ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("d{}", ns)
}

fn mirror_md(project_path: &str, doc_id: &str, md: &str) -> Result<(), String> {
    let path = Path::new(project_path).join("md").join(format!("{doc_id}.md"));
    atomic_write(&path, md.as_bytes()).map_err(|e| e.to_string())
}

// ---------- Commands ----------
#[tauri::command]
pub fn create_project(dir: String, name: String) -> Result<String, String> {
    let base = Path::new(&dir).join(name);
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(base.join("md")).ok();
    std::fs::create_dir_all(base.join("backups")).ok();

    let dbp = base.join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    run_migrations(&mut conn).map_err(|e| e.to_string())?;

    Ok(base.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_project(dir: String) -> Result<String, String> {
    Ok(dir)
}

#[tauri::command]
pub fn list_tree(project_path: String) -> Result<serde_json::Value, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let docs = select_docs(&conn).map_err(|e| e.to_string())?;
    let folders = select_folders(&conn).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "docs": docs, "folders": folders }))
}

#[tauri::command]
pub fn create_document(
    project_path: String,
    title: String,
    folder_id: Option<String>,
) -> Result<String, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let id = new_id();
    conn.execute(
        "INSERT INTO Document(id, project_id, folder_id, title) VALUES(?, 'p1', ?, ?)",
        params![id, folder_id, title],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO Body(document_id, markdown) VALUES(?, '# New Document')",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    mirror_md(&project_path, &id, "# New Document")?;
    Ok(id)
}

#[tauri::command]
pub fn create_folder(
    project_path: String,
    name: String,
    parent_id: Option<String>,
) -> Result<String, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let id = new_id();
    conn.execute(
        "INSERT INTO Folder(id, project_id, parent_id, name) VALUES(?, 'p1', ?, ?)",
        params![id, parent_id, name],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn load_document(project_path: String, doc_id: String) -> Result<String, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let mut st = conn
        .prepare("SELECT markdown FROM Body WHERE document_id=?")
        .map_err(|e| e.to_string())?;

    let md: String = st
        .query_row([doc_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    Ok(md)
}

#[tauri::command]
pub fn save_document(project_path: String, doc_id: String, markdown: String) -> Result<(), String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE Body SET markdown=?, updated_at=CURRENT_TIMESTAMP WHERE document_id=?",
        params![markdown, doc_id],
    )
    .map_err(|e| e.to_string())?;

    mirror_md(&project_path, &doc_id, &markdown)?;
    Ok(())
}

#[tauri::command]
pub fn search(project_path: String, q: String) -> Result<Vec<(String, String)>, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let mut st = conn
        .prepare(
            "SELECT Document.id, snippet(body_fts, -1, '<b>','</b>','…', 12)
             FROM body_fts
             JOIN Body ON body_fts.rowid = Body.rowid
             JOIN Document ON Body.document_id = Document.id
             WHERE body_fts MATCH ?
             LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let rows = st
        .query_map([q], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn create_snapshot(project_path: String, doc_id: String, note: String) -> Result<(), String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;

    let md: String = conn
        .query_row(
            "SELECT markdown FROM Body WHERE document_id=?",
            [doc_id.clone()],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let id = new_id();
    conn.execute(
        "INSERT INTO Snapshot(id, document_id, note, markdown) VALUES(?,?,?,?)",
        params![id, doc_id, note, md],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn backup_project(project_path: String) -> Result<(), String> {
    use std::io::Write;

    let ts = Utc::now().format("%Y%m%d_%H%M%S");
    let backup_path = Path::new(&project_path)
        .join("backups")
        .join(format!("backup_{ts}.zip"));

    let mut zipw =
        zip::ZipWriter::new(std::fs::File::create(&backup_path).map_err(|e| e.to_string())?);
    let opts = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // include db
    let dbp = Path::new(&project_path).join("project.db");
    zipw.start_file("project.db", opts).map_err(|e| e.to_string())?;
    let db_bytes = std::fs::read(&dbp).map_err(|e| e.to_string())?;
    zipw.write_all(&db_bytes).map_err(|e| e.to_string())?;

    // include md mirror directory
    let md_dir = Path::new(&project_path).join("md");
    if md_dir.exists() {
        for entry in walkdir::WalkDir::new(&md_dir)
            .into_iter()
            .flatten()
            .filter(|e| e.file_type().is_file())
        {
            let rel = entry.path().strip_prefix(&project_path).unwrap();
            zipw.start_file(rel.to_string_lossy(), opts)
                .map_err(|e| e.to_string())?;
            let bytes = std::fs::read(entry.path()).map_err(|e| e.to_string())?;
            zipw.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }

    zipw.finish().map_err(|e| e.to_string())?;
    Ok(())
}
