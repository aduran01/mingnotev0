import { useEffect, useRef, useState } from "react";
import { state, Attribute } from "../../lib/store";
import { useSnapshot } from "valtio";
import { loadCharacter, saveCharacter, importCharacterImage } from "../../lib/ipc";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";

// Utility functions to classify URLs and paths.  These helpers are unchanged
// from the original implementation, but moved here for clarity.  They
// determine whether a string looks like an HTTP URL, a PDF, or an
// absolute/relative filesystem path, and normalise path separators.
function isHttpUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw);
}
function isPdf(path: string): boolean {
  return /\.pdf(\?.*)?$/i.test(path);
}
function looksAbsolutePath(p: string): boolean {
  // Windows "C:\", UNC "\\server\share", or POSIX "/"
  return /^[a-zA-Z]:[\\\/]/.test(p) || /^\\\\/.test(p) || p.startsWith("/");
}
function normSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * The character editor allows users to view and edit metadata about a
 * character.  It supports attaching an image or PDF file, editing
 * standard fields (age, nationality, sexuality, height), and managing a
 * dynamic list of arbitrary attributes.  Changes are autosaved every 5
 * seconds and persisted when the editor loses focus.
 */
export default function CharacterEditor() {
  const s = useSnapshot(state);
  const timer = useRef<number | undefined>(undefined);

  // Derived URL used to display the attached image/PDF.  This always
  // contains a cache‑buster so that the Tauri WebView refreshes the image
  // immediately after it changes on disk.
  const [imageUrl, setImageUrl] = useState<string>("");

  // Resolve whatever is stored in state.charEditor.image into a
  // WebView‑safe URL.  If the string is an HTTP URL it is returned
  // unchanged; otherwise it is resolved against the project root,
  // converted into a file URI with convertFileSrc, and appended with a
  // timestamp to force reload.  If any step fails, an empty string
  // triggers the "No image" placeholder in the UI.
  const buildDisplayUrl = async (raw: string): Promise<string> => {
    if (!raw) return "";
    if (isHttpUrl(raw)) return raw;
    let pathOnDisk = normSlashes(raw);
    try {
      if (!looksAbsolutePath(pathOnDisk)) {
        pathOnDisk = await join(state.projectPath, pathOnDisk);
      }
      const url = convertFileSrc(pathOnDisk);
      return `${url}?v=${Date.now()}`;
    } catch {
      return "";
    }
  };

  // Update the derived image URL whenever the stored image path or project
  // path changes.  This ensures that switching characters or moving a
  // project correctly refreshes the preview.
  useEffect(() => {
    (async () => {
      setImageUrl(await buildDisplayUrl(s.charEditor.image));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.charEditor.image, s.projectPath]);

  // Load character data when switching characters or projects.  The
  // underlying IPC call returns a JSON object with all stored fields.
  useEffect(() => {
    (async () => {
      if (!s.projectPath || !s.currentCharId) return;
      const data = await loadCharacter(s.projectPath, s.currentCharId);
      state.charEditor.age = data.age ?? "";
      state.charEditor.nationality = data.nationality ?? "";
      state.charEditor.sexuality = data.sexuality ?? "";
      state.charEditor.height = data.height ?? "";
      let attrs: Attribute[] = [];
      if (Array.isArray(data.attributes)) attrs = data.attributes as Attribute[];
      else if (typeof data.attributes === "string" && data.attributes.trim()) {
        try {
          const parsed = JSON.parse(data.attributes);
          if (Array.isArray(parsed)) attrs = parsed as Attribute[];
        } catch {}
      }
      state.charEditor.attributes = attrs;
      state.charEditor.image = (data.image ?? data.image_path ?? "") || "";
    })();
  }, [s.projectPath, s.currentCharId]);

  // Autosave all character fields every 5 seconds.  Each timer tick
  // persists the current state into the database via IPC.  The
  // dependency array includes every mutable field so that the timer is
  // reset whenever something changes, avoiding stale closures.
  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      if (!s.currentCharId) return;
      const payload = {
        age: state.charEditor.age,
        nationality: state.charEditor.nationality,
        sexuality: state.charEditor.sexuality,
        height: state.charEditor.height,
        attributes: state.charEditor.attributes,
        image: state.charEditor.image,
      };
      try {
        await saveCharacter(state.projectPath, state.currentCharId, payload);
        state.charEditor.lastSaved = Date.now();
      } catch {}
    }, 5000) as unknown as number;
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [
    s.currentCharId,
    s.charEditor.age,
    s.charEditor.nationality,
    s.charEditor.sexuality,
    s.charEditor.height,
    s.charEditor.attributes,
    s.charEditor.image,
  ]);

  // Persist changes immediately when focus leaves an input.  This
  // complements the autosave timer and ensures that rapid edits are
  // flushed to disk when the user moves on.
  const onBlur = async () => {
    if (!s.currentCharId) return;
    const payload = {
      age: state.charEditor.age,
      nationality: state.charEditor.nationality,
      sexuality: state.charEditor.sexuality,
      height: state.charEditor.height,
      attributes: state.charEditor.attributes,
      image: state.charEditor.image,
    };
    await saveCharacter(state.projectPath, s.currentCharId, payload);
    state.charEditor.lastSaved = Date.now();
  };

  // When the user picks a file via the "Add image" button, show an
  // immediate preview of the chosen file before it has been imported.  This
  // dramatically improves perceived responsiveness because the preview does
  // not wait on the IPC call to copy the file into the project.  After
  // import completes, persist the new relative path and refresh the
  // display with a fresh cache‑buster.
  const onPickImage = async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] },
        { name: "PDF", extensions: ["pdf"] },
        { name: "All", extensions: ["*"] },
      ],
    });
    if (!picked || typeof picked !== "string") return;
    // Show a temporary preview of the raw file.  We append a
    // cache‑buster to ensure that the WebView reloads the file even if
    // the same path is chosen repeatedly.
    const previewUrl = convertFileSrc(picked);
    setImageUrl(`${previewUrl}?v=${Date.now()}`);
    // Copy the file into the project's character asset folder.  The
    // returned path is relative to the project root and is what we
    // persist into our DB.  This operation might take a moment on
    // large files, hence the eager preview above.
    const destRelPath = await importCharacterImage(
      state.projectPath,
      state.currentCharId,
      picked,
    );
    // Persist and update state.  Note that we call saveCharacter
    // immediately so that the imported image is written to disk before
    // the next autosave tick.
    state.charEditor.image = destRelPath;
    await saveCharacter(state.projectPath, state.currentCharId, {
      age: state.charEditor.age,
      nationality: state.charEditor.nationality,
      sexuality: state.charEditor.sexuality,
      height: state.charEditor.height,
      attributes: state.charEditor.attributes,
      image: destRelPath,
    });
    state.charEditor.lastSaved = Date.now();
    // Finally refresh the preview to point at the copied file rather than
    // the original source.  This ensures that the preview continues to
    // work even if the user deletes the original.
    setImageUrl(await buildDisplayUrl(destRelPath));
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
        width: "50%",
        maxWidth: "120ch",
        margin: "0 auto",
        padding: "24px",
      }}
    >
      {/* Image section */}
      <div className="card" style={{ padding: "16px", marginBottom: "16px" }}>
        <h2 style={{ margin: 0, marginBottom: "12px", fontSize: "1.2rem" }}>Character image</h2>
        {imageUrl ? (
          isPdf(s.charEditor.image) ? (
            <object
              key={imageUrl}
              data={imageUrl}
              type="application/pdf"
              style={{ width: "100%", height: 300, marginBottom: 8, border: "1px solid var(--color-border)", borderRadius: 8 }}
            >
              <p style={{ margin: 0, padding: 8 }}>
                PDF preview not supported here. <a href={imageUrl} target="_blank" rel="noreferrer">Open PDF</a>
              </p>
            </object>
          ) : (
            <img
              key={imageUrl}
              src={imageUrl}
              alt="Character"
              style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain", marginBottom: 8 }}
              onError={() => setImageUrl("")}
            />
          )
        ) : (
          <div
            style={{
              width: "100%",
              height: 300,
              background: "#f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#a0aec0",
              marginBottom: 8,
              border: "1px dashed var(--color-border)",
              borderRadius: 8,
            }}
          >
            No image
          </div>
        )}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={onPickImage}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer" }}
            aria-label="Pick an image"
          >
            Add image
          </button>
        </div>
      </div>

      {/* Profile fields */}
      <div className="card" style={{ padding: "16px", marginBottom: "16px" }}>
        <h2 style={{ margin: 0, marginBottom: "12px", fontSize: "1.2rem" }}>Profile details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px" }}>
          <input placeholder="Age" value={s.charEditor.age} onChange={(e) => (state.charEditor.age = e.target.value)} onBlur={onBlur} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }} aria-label="Age" />
          <input placeholder="Nationality" value={s.charEditor.nationality} onChange={(e) => (state.charEditor.nationality = e.target.value)} onBlur={onBlur} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }} aria-label="Nationality" />
          <input placeholder="Sexuality" value={s.charEditor.sexuality} onChange={(e) => (state.charEditor.sexuality = e.target.value)} onBlur={onBlur} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }} aria-label="Sexuality" />
          <input placeholder="Height" value={s.charEditor.height} onChange={(e) => (state.charEditor.height = e.target.value)} onBlur={onBlur} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }} aria-label="Height" />
        </div>
      </div>

      {/* Attributes */}
      <div className="card" style={{ padding: "16px", flex: 1, overflowY: "auto" }}>
        <h2 style={{ margin: 0, marginBottom: "12px", fontSize: "1.2rem" }}>Attributes</h2>
        {s.charEditor.attributes.map((attr, idx) => (
          <div key={idx} style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
            <input
              placeholder="Attribute name"
              value={attr.key}
              onChange={(e) => (state.charEditor.attributes[idx] = { ...attr, key: e.target.value })}
              onBlur={onBlur}
              style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--color-border)", minWidth: 0 }}
              aria-label="Attribute name"
            />
            <input
              placeholder="Value"
              value={attr.value}
              onChange={(e) => (state.charEditor.attributes[idx] = { ...attr, value: e.target.value })}
              onBlur={onBlur}
              style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--color-border)", minWidth: 0 }}
              aria-label="Attribute value"
            />
            <button
              onClick={() => state.charEditor.attributes.splice(idx, 1)}
              title="Remove attribute"
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer" }}
              aria-label="Remove attribute"
            >
              🗑
            </button>
          </div>
        ))}
        <button
          onClick={() => state.charEditor.attributes.push({ key: "", value: "" })}
          style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer" }}
          aria-label="Add new attribute"
        >
          Add attribute
        </button>
      </div>

      <div style={{ fontSize: 12, color: "var(--color-muted)", padding: "12px 0", alignSelf: "flex-end" }}>
        Saved {s.charEditor.lastSaved ? new Date(s.charEditor.lastSaved).toLocaleTimeString() : "—"}
      </div>
    </div>
  );
}