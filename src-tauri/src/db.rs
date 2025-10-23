use rusqlite::{Connection, Result};

pub fn run_migrations(conn: &mut Connection) -> Result<()> {
  conn.execute_batch(include_str!("../migrations/0001_init.sql"))?;
  Ok(())
}

pub fn select_docs(conn: &Connection) -> Result<Vec<serde_json::Value>> {
  let mut st = conn.prepare(
    "SELECT id, title, folder_id
     FROM Document
     ORDER BY created_at ASC",
  )?;
  let rows = st.query_map([], |r| {
    Ok(serde_json::json!({
      "id": r.get::<_, String>(0)?,
      "title": r.get::<_, String>(1)?,
      "folderId": r.get::<_, Option<String>>(2)?,
    }))
  })?;
  Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn select_folders(conn: &Connection) -> Result<Vec<serde_json::Value>> {
  let mut st = conn.prepare(
    "SELECT id, name, parent_id
     FROM Folder
     ORDER BY name ASC",
  )?;
  let rows = st.query_map([], |r| {
    Ok(serde_json::json!({
      "id": r.get::<_, String>(0)?,
      "name": r.get::<_, String>(1)?,
      "parentId": r.get::<_, Option<String>>(2)?,
    }))
  })?;
  Ok(rows.filter_map(|r| r.ok()).collect())
}
