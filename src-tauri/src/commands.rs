// Copyright (c) MingNote developers
//
// This module contains all of the Tauri commands exposed to the front‑end via
// `invoke`.  In addition to the original functionality (project creation,
// document and character CRUD operations, backup, etc.), this version adds
// support for mirroring documents to a Microsoft Word `.docx` file and
// exporting character profiles to PDF.  These new capabilities make it
// possible to work seamlessly with external word processors and share
// character sheets in a portable format.

use std::path::Path;

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use zip::{write::FileOptions, CompressionMethod, ZipWriter};


// External crates for generating docx and PDF.  These are optional
// dependencies added to Cargo.toml.  See the corresponding entries in
// `src-tauri/Cargo.toml` for version details.
use docx_rust::document::Paragraph;
use docx_rust::Docx;
use printpdf::{BuiltinFont, Mm, PdfDocument};

use crate::db::{run_migrations, select_docs, select_folders, select_chars};
use crate::fs_utils::atomic_write;

// ------- Types
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

// ------- Helpers

/// Generate a unique identifier for new rows.  Uses the current time in
/// nanoseconds to guarantee ordering.
fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("d{}", ns)
}

/// Mirror the provided Markdown string to a `.md` file on disk.  This is
/// preserved for backwards compatibility and internal editing.  Documents
/// continue to be persisted in plain text for quick diffs and search.
fn mirror_md(project_path: &str, doc_id: &str, md: &str) -> Result<(), String> {
    let path = Path::new(project_path)
        .join("md")
        .join(format!("{doc_id}.md"));
    atomic_write(&path, md.as_bytes()).map_err(|e| e.to_string())
}

/// Mirror the provided Markdown to a Word `.docx` file.  Each line in the
/// markdown becomes a paragraph in the resulting document.  The destination
/// directory `docx/` will be created if it does not exist.
fn mirror_docx(project_path: &str, doc_id: &str, md: &str) -> Result<(), String> {
    // Build a Docx document.  We use the minimal API from the `docx_rust`
    // crate: create an empty document, push paragraphs, then write it out.
    let mut docx = Docx::default();
    for line in md.lines() {
        let para = Paragraph::default().push_text(line);
        docx.document.push(para);
    }

    // Ensure the destination directory exists.  We place docx files in a
    // dedicated `docx/` folder at the project root so they don't collide with
    // markdown files.  If the folder cannot be created, return an error.
    let dest_dir = Path::new(project_path).join("docx");
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest_path = dest_dir.join(format!("{doc_id}.docx"));
    docx
        .write_file(&dest_path)
        .map_err(|e| format!("Failed to write docx: {e}"))
        .map(|_| ())  // <-- discard File and return ()
}

/// Generate a PDF file summarising a character's details.  The PDF is saved
/// under `assets/characters/<char_id>/<char_id>.pdf`.  The PDF contains
/// textual information (name, age, nationality, sexuality, height and
/// attributes).  This function ignores image embedding to keep the logic
/// simple; if an image is present, it is omitted from the PDF but remains
/// available in the character editor.
fn export_character_pdf(
    project_path: &str,
    char_id: &str,
    name: &str,
    age: &str,
    nationality: &str,
    sexuality: &str,
    height: &str,
    attributes_json: &str,
) -> Result<(), String> {
    use std::io::BufWriter;
    use std::fs::File;

    // Create a new A4 PDF document.  Use a single page and a single layer
    // (layer name is unused but required by API).
    let (doc, page1, layer1) = PdfDocument::new(
        format!("Character {name}").as_str(),
        Mm(210.0),
        Mm(297.0),
        "Layer 1",
    );
    let current_page = doc.get_page(page1);
    let current_layer = current_page.get_layer(layer1);
    // Use a built‑in font.  Helvetica is a good neutral choice.
    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;

    // Helper to write lines of text at successive vertical positions.
    // Start from the top margin and move downward by a fixed offset per line.
    let mut y = 280.0; // mm from bottom, leaving margin at top of 17 mm (297 - 280 - 17)
    let line_height = 8.0;
    let mut write_line = |text: &str, layer: &printpdf::PdfLayerReference| {
        layer.use_text(text, 12.0, Mm(15.0), Mm(y), &font);
        y -= line_height;
    };

    write_line(&format!("Name: {name}"), &current_layer);
    write_line(&format!("Age: {age}"), &current_layer);
    write_line(&format!("Nationality: {nationality}"), &current_layer);
    write_line(&format!("Sexuality: {sexuality}"), &current_layer);
    write_line(&format!("Height: {height}"), &current_layer);

    // Deserialize the attributes JSON (if any) into key/value pairs.  The
    // incoming string may be either a JSON array or a literal string; we
    // attempt to parse it and fallback gracefully.
    if !attributes_json.trim().is_empty() {
        let parsed: serde_json::Result<serde_json::Value> =
            serde_json::from_str(attributes_json);
        if let Ok(serde_json::Value::Array(items)) = parsed {
            write_line("Attributes:", &current_layer);
            for item in items.iter() {
                let key = item.get("key").and_then(|v| v.as_str()).unwrap_or("");
                let val = item.get("value").and_then(|v| v.as_str()).unwrap_or("");
                write_line(&format!("  - {}: {}", key, val), &current_layer);
            }
        }
    }

    // Ensure the destination directory exists.  Each character has its own
    // subdirectory under `assets/characters`.  Reuse this folder for the PDF.
    let dest_dir = Path::new(project_path)
        .join("assets")
        .join("characters")
        .join(char_id);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest_path = dest_dir.join(format!("{char_id}.pdf"));
    let mut output = BufWriter::new(File::create(&dest_path).map_err(|e| e.to_string())?);
    doc.save(&mut output).map_err(|e| e.to_string())
}

// Remove a document row and its markdown file.  This helper is unchanged
// from the original version.
fn delete_doc_internal(
    conn: &mut Connection,
    project_path: &str,
    doc_id: &str,
) -> Result<(), String> {
    // Delete from DB (Body is removed via ON DELETE CASCADE).
    conn.execute("DELETE FROM Document WHERE id=?", params![doc_id])
        .map_err(|e| e.to_string())?;
    // Remove the markdown file if it exists.
    let md_path = Path::new(project_path)
        .join("md")
        .join(format!("{doc_id}.md"));
    let _ = fs::remove_file(&md_path);
    // Remove the docx file if it exists.
    let docx_path = Path::new(project_path)
        .join("docx")
        .join(format!("{doc_id}.docx"));
    let _ = fs::remove_file(&docx_path);
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

// ------- Commands

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
    use rusqlite::{params, Connection};
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    // 1) Collect all descendant folder ids (BFS).
    let mut to_delete = vec![folder_id.clone()];
    let mut idx = 0;
    while idx < to_delete.len() {
        let current = to_delete[idx].clone();
        idx += 1;
        // Scope ensures prepared statement drops before next use of &mut conn
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
    // 2) For each folder, delete its docs.
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
            delete_doc_internal(&mut conn, &project_path, &doc_id)?;
        }
        // Delete characters in this folder.
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
    // 4) Delete folders themselves (children first).
    for fid in to_delete.into_iter().rev() {
        conn.execute("DELETE FROM Folder WHERE id=?", params![fid])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ------- Project management

#[tauri::command]
pub fn create_project(dir: String, name: String) -> Result<String, String> {
    // Create base directories.  In addition to the original `md` folder for
    // markdown files, create a `docx` folder up front to hold generated
    // Word documents.  Also create `backups` for zipped backups.
    let base = Path::new(&dir).join(&name);
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    fs::create_dir_all(base.join("md")).ok();
    fs::create_dir_all(base.join("docx")).ok();
    fs::create_dir_all(base.join("backups")).ok();

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
    let chars = select_chars(&conn).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "docs": docs, "folders": folders, "characters": chars }))
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
    // Write initial md and docx files
    mirror_md(&project_path, &id, "# New Document")?;
    mirror_docx(&project_path, &id, "# New Document")?;
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
pub fn save_document(
    project_path: String,
    doc_id: String,
    markdown: String,
) -> Result<(), String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE Body SET markdown=?, updated_at=CURRENT_TIMESTAMP WHERE document_id=?",
        params![markdown, doc_id],
    )
    .map_err(|e| e.to_string())?;
    // Persist both .md and .docx
    mirror_md(&project_path, &doc_id, &markdown)?;
    mirror_docx(&project_path, &doc_id, &markdown)?;
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
pub fn create_snapshot(
    project_path: String,
    doc_id: String,
    note: String,
) -> Result<(), String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    let md: String = conn
        .query_row("SELECT markdown FROM Body WHERE document_id=?", [doc_id.clone()], |r| {
            r.get(0)
        })
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
    let mut zipw = zip::ZipWriter::new(
        std::fs::File::create(&backup_path).map_err(|e| e.to_string())?,
    );
    let opts = zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    // Include the database
    let dbp = Path::new(&project_path).join("project.db");
    zipw.start_file("project.db", opts).map_err(|e| e.to_string())?;
    let db_bytes = std::fs::read(&dbp).map_err(|e| e.to_string())?;
    zipw.write_all(&db_bytes).map_err(|e| e.to_string())?;
    // Include markdown files
    let md_dir = Path::new(&project_path).join("md");
    if md_dir.exists() {
        for entry in walkdir::WalkDir::new(&md_dir)
            .into_iter()
            .flatten()
            .filter(|e| e.file_type().is_file())
        {
            let rel = entry.path().strip_prefix(&project_path).unwrap();
            zipw.start_file(rel.to_string_lossy(), opts).map_err(|e| e.to_string())?;
            let bytes = std::fs::read(entry.path()).map_err(|e| e.to_string())?;
            zipw.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }
    // Include docx files
    let docx_dir = Path::new(&project_path).join("docx");
    if docx_dir.exists() {
        for entry in walkdir::WalkDir::new(&docx_dir)
            .into_iter()
            .flatten()
            .filter(|e| e.file_type().is_file())
        {
            let rel = entry.path().strip_prefix(&project_path).unwrap();
            zipw.start_file(rel.to_string_lossy(), opts).map_err(|e| e.to_string())?;
            let bytes = std::fs::read(entry.path()).map_err(|e| e.to_string())?;
            zipw.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }
    zipw.finish().map_err(|e| e.to_string())?;
    Ok(())
}

// ----------------- Characters -----------------

#[tauri::command]
pub fn create_character(
    project_path: String,
    name: String,
    folder_id: Option<String>,
) -> Result<String, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    let id = new_id();
    conn.execute(
        "INSERT INTO Character(id, project_id, folder_id, name, age, nationality, sexuality, height, attributes, image_path)
         VALUES(?, 'p1', ?, ?, '', '', '', '', '[]', '')",
        params![id, folder_id, name],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn load_character(
    project_path: String,
    char_id: String,
) -> Result<serde_json::Value, String> {
    let dbp = Path::new(&project_path).join("project.db");
    let conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    let mut st = conn
        .prepare(
            "SELECT name, folder_id, age, nationality, sexuality, height, attributes, image_path
         FROM Character WHERE id=?",
        )
        .map_err(|e| e.to_string())?;
    let result = st
        .query_row([char_id.clone()], |r| {
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
        })
        .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub fn save_character(
    project_path: String,
    char_id: String,
    data: serde_json::Value,
) -> Result<(), String> {
    let dbp = Path::new(&project_path).join("project.db");
    let mut conn = Connection::open(&dbp).map_err(|e| e.to_string())?;
    let age = data
        .get("age")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let nationality = data
        .get("nationality")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let sexuality = data
        .get("sexuality")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let height = data
        .get("height")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    // Convert attributes to string.  Accept both arrays and strings.
    let attributes_value = match data.get("attributes") {
        Some(v) => {
            if v.is_string() {
                v.as_str().unwrap_or("").to_string()
            } else {
                serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string())
            }
        }
        None => "[]".to_string(),
    };
    let image = data
        .get("image")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let name = data
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    conn.execute(
        "UPDATE Character
         SET age=?, nationality=?, sexuality=?, height=?, attributes=?, image_path=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?",
        params![
            age,
            nationality,
            sexuality,
            height,
            attributes_value,
            image,
            char_id
        ],
    )
    .map_err(|e| e.to_string())?;
    // Export PDF to disk.  Use the current values; if generation fails, ignore
    // the error to avoid blocking the save.  The exported PDF will live under
    // the character's asset directory.
    let _ = export_character_pdf(
        &project_path,
        &char_id,
        &name,
        &age,
        &nationality,
        &sexuality,
        &height,
        &attributes_value,
    );
    Ok(())
}

#[tauri::command]
pub fn import_character_image(
    project_path: String,
    char_id: String,
    source_path: String,
) -> Result<String, String> {
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
    let filename = src
        .file_name()
        .ok_or("invalid filename")?;
    let dest_path = dest_dir.join(filename);
    fs::copy(&src, &dest_path).map_err(|e| e.to_string())?;
    Ok(dest_path.to_string_lossy().to_string())
}