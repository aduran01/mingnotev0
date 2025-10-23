use std::{fs, io::Write, path::Path};
use tempfile::NamedTempFile;

pub fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
  let parent = path.parent().ok_or(std::io::Error::new(
    std::io::ErrorKind::Other,
    "no parent",
  ))?;
  fs::create_dir_all(parent)?;
  let mut tmp = NamedTempFile::new_in(parent)?;
  tmp.write_all(bytes)?;
  tmp.as_file().sync_all()?;
  tmp.persist(path).map_err(|e| e.error)?;
  #[cfg(unix)]
  {
    use std::os::unix::fs::OpenOptionsExt;
    let dir = std::fs::OpenOptions::new()
      .read(true)
      .custom_flags(libc::O_DIRECTORY)
      .open(parent)?;
    dir.sync_all()?;
  }
  Ok(())
}
