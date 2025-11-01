// src-tauri/src/fs.rs
use std::fs;
use std::path::{Path, PathBuf};
use anyhow::{anyhow, Context, Result};

/// Change this to your app's workspace root resolver.
/// If you already have one, use that instead and remove this function.
fn workspace_root() -> Result<PathBuf> {
    // Example: use the current_dir as the project root.
    // In production, prefer an app config location (e.g., app_dir).
    std::env::current_dir().context("Failed to get current_dir as workspace root")
}

fn ensure_within_workspace(abs_path: &Path) -> Result<()> {
    let root = workspace_root()?;
    let abs = abs_path.canonicalize().with_context(|| format!("canonicalize: {}", abs_path.display()))?;
    let root_canon = root.canonicalize().context("canonicalize root")?;
    if !abs.starts_with(&root_canon) {
        return Err(anyhow!("Refusing to delete outside workspace root"));
    }
    Ok(())
}

pub fn delete_folder_recursive(abs_path: &str) -> Result<()> {
    let p = Path::new(abs_path);
    ensure_within_workspace(p)?;
    if !p.is_dir() {
        return Err(anyhow!("Path is not a folder: {}", abs_path));
    }
    fs::remove_dir_all(p).with_context(|| format!("remove_dir_all failed: {}", abs_path))?;
    Ok(())
}

pub fn delete_doc(abs_path: &str) -> Result<()> {
    let p = Path::new(abs_path);
    ensure_within_workspace(p)?;
    if !p.is_file() {
        return Err(anyhow!("Path is not a file: {}", abs_path));
    }
    fs::remove_file(p).with_context(|| format!("remove_file failed: {}", abs_path))?;
    Ok(())
}

pub fn delete_character(abs_path: &str) -> Result<()> {
    // If characters are stored as files, this is same as doc; if a folder, adjust as needed.
    let p = Path::new(abs_path);
    ensure_within_workspace(p)?;
    if p.is_dir() {
        // Some apps keep a character as a folder — handle both gracefully.
        fs::remove_dir_all(p).with_context(|| format!("remove_dir_all (character) failed: {}", abs_path))?;
    } else if p.is_file() {
        fs::remove_file(p).with_context(|| format!("remove_file (character) failed: {}", abs_path))?;
    } else {
        return Err(anyhow!("Character path not found: {}", abs_path));
    }
    Ok(())
}
