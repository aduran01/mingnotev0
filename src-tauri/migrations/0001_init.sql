PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;


-- Minimal single-project schema (project_id fixed to 'p1' for alpha)
CREATE TABLE IF NOT EXISTS Document(
id TEXT PRIMARY KEY,
project_id TEXT NOT NULL DEFAULT 'p1',
folder_id TEXT,
title TEXT NOT NULL,
created_at TEXT DEFAULT CURRENT_TIMESTAMP,
updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS Folder(
id TEXT PRIMARY KEY,
project_id TEXT NOT NULL DEFAULT 'p1',
parent_id TEXT,
name TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS Body(
document_id TEXT PRIMARY KEY REFERENCES Document(id) ON DELETE CASCADE,
markdown TEXT NOT NULL,
updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);


CREATE VIRTUAL TABLE IF NOT EXISTS body_fts USING fts5(markdown, content='Body', content_rowid='rowid');


CREATE TRIGGER IF NOT EXISTS body_ai AFTER INSERT ON Body BEGIN
INSERT INTO body_fts(rowid, markdown) VALUES (new.rowid, new.markdown);
END;
CREATE TRIGGER IF NOT EXISTS body_ad AFTER DELETE ON Body BEGIN
INSERT INTO body_fts(body_fts, rowid, markdown) VALUES('delete', old.rowid, old.markdown);
END;
CREATE TRIGGER IF NOT EXISTS body_au AFTER UPDATE ON Body BEGIN
INSERT INTO body_fts(body_fts, rowid, markdown) VALUES('delete', old.rowid, old.markdown);
INSERT INTO body_fts(rowid, markdown) VALUES (new.rowid, new.markdown);
END;


CREATE TABLE IF NOT EXISTS Snapshot(
id TEXT PRIMARY KEY,
document_id TEXT NOT NULL REFERENCES Document(id) ON DELETE CASCADE,
created_at TEXT DEFAULT CURRENT_TIMESTAMP,
note TEXT,
markdown TEXT
);

-- New Character type
CREATE TABLE IF NOT EXISTS "Character" (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  folder_id TEXT,
  name TEXT NOT NULL,
  age TEXT,
  nationality TEXT,
  sexuality TEXT,
  height TEXT,
  attributes TEXT,
  image_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);