import { useEffect, useRef, useState } from "react";
import { state, Attribute } from "../../lib/store";
import { useSnapshot } from "valtio";
import { loadCharacter, saveCharacter, importCharacterImage } from "../../lib/ipc";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";

// NOTE: This file has been modified to remove the input field that allowed
// users to paste arbitrary image/PDF URLs or local paths.  Images must now
// be attached exclusively via the "Add image" button, which prompts the
// user to select a file from their filesystem.  All other functionality
// (auto‐saving, attribute editing, etc.) remains unchanged.

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

export default function CharacterEditor() {
  const s = useSnapshot(state);
  const timer = useRef<number | undefined>(undefined);

  // Local derived URL for display (safe for WebView)
  const [imageUrl, setImageUrl] = useState<string>("");

  // Build a safe, displayable URL from whatever is in s.charEditor.image
  const buildDisplayUrl = async (raw: string): Promise<string> => {
    if (!raw) return "";
    if (isHttpUrl(raw)) return raw; // use as‑is

    let pathOnDisk = normSlashes(raw);
    try {
      // Resolve relative paths against the project root
      if (!looksAbsolutePath(pathOnDisk)) {
        pathOnDisk = await join(state.projectPath, pathOnDisk);
      }
      // Convert to webview‑safe URL and add a cache‑buster so changes show immediately
      const url = convertFileSrc(pathOnDisk);
      return `${url}?v=${Date.now()}`;
    } catch {
      return "";
    }
  };

  // Refresh derived image URL whenever the stored path changes
  useEffect(() => {
    (async () => {
      setImageUrl(await buildDisplayUrl(s.charEditor.image));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.charEditor.image, s.projectPath]);

  // Load when switching characters
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

  // Autosave every 5s
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

    // Copy file into the project so it stays portable
    const destAbsPath = await importCharacterImage(state.projectPath, state.currentCharId, picked);

    // Persist and update UI
    state.charEditor.image = destAbsPath; // absolute path
    await saveCharacter(state.projectPath, s.currentCharId, {
      age: state.charEditor.age,
      nationality: state.charEditor.nationality,
      sexuality: state.charEditor.sexuality,
      height: state.charEditor.height,
      attributes: state.charEditor.attributes,
      image: destAbsPath,
    });
    state.charEditor.lastSaved = Date.now();

    // Force refresh of derived URL immediately
    setImageUrl(await buildDisplayUrl(destAbsPath));
  };

  return (
    <div
  style={{
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflowY: "auto",
    width: "50%",          // ⬅ wider panel
    maxWidth: "120ch",     // ⬅ expands readable width (~120 characters)
    margin: "0 auto",
    padding: "24px",       // ⬅ slightly more breathing room
  }}
>

      {/* Image */}
      <div className="card" style={{ padding: "16px", marginBottom: "16px" }}>
        <h2 style={{ margin: 0, marginBottom: "12px", fontSize: "1.2rem" }}>Character image</h2>

        {imageUrl ? (
          isPdf(s.charEditor.image) ? (
            <object
              key={imageUrl}                      // ensures re‑render when URL changes
              data={imageUrl}
              type="application/pdf"
              style={{ width: "100%", height: 300, marginBottom: 8, border: "1px solid var(--border)", borderRadius: 8 }}
            >
              <p style={{ margin: 0, padding: 8 }}>
                PDF preview not supported here.{" "}
                <a href={imageUrl} target="_blank" rel="noreferrer">Open PDF</a>
              </p>
            </object>
          ) : (
            <img
              key={imageUrl}                      // ensures refresh on update
              src={imageUrl}
              alt="Character"
              style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain", marginBottom: 8 }}
              onError={() => setImageUrl("")}     // graceful fallback if WebView blocks it
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
              border: "1px dashed var(--border)",
              borderRadius: 8,
            }}
          >
            No image
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={onPickImage}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer" }}
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
          <input placeholder="Age" value={s.charEditor.age} onChange={(e) => (state.charEditor.age = e.target.value)} onBlur={onBlur} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }} aria-label="Age" />
          <input placeholder="Nationality" value={s.charEditor.nationality} onChange={(e) => (state.charEditor.nationality = e.target.value)} onBlur={onBlur} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }} aria-label="Nationality" />
          <input placeholder="Sexuality" value={s.charEditor.sexuality} onChange={(e) => (state.charEditor.sexuality = e.target.value)} onBlur={onBlur} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }} aria-label="Sexuality" />
          <input placeholder="Height" value={s.charEditor.height} onChange={(e) => (state.charEditor.height = e.target.value)} onBlur={onBlur} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }} aria-label="Height" />
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
              style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--border)", minWidth: 0 }}
              aria-label="Attribute name"
            />
            <input
              placeholder="Value"
              value={attr.value}
              onChange={(e) => (state.charEditor.attributes[idx] = { ...attr, value: e.target.value })}
              onBlur={onBlur}
              style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--border)", minWidth: 0 }}
              aria-label="Attribute value"
            />
            <button
              onClick={() => state.charEditor.attributes.splice(idx, 1)}
              title="Remove attribute"
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer" }}
              aria-label="Remove attribute"
            >
              🗑
            </button>
          </div>
        ))}
        <button
          onClick={() => state.charEditor.attributes.push({ key: "", value: "" })}
          style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer" }}
          aria-label="Add new attribute"
        >
          Add attribute
        </button>
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", padding: "12px 0", alignSelf: "flex-end" }}>
        Saved {s.charEditor.lastSaved ? new Date(s.charEditor.lastSaved).toLocaleTimeString() : "—"}
      </div>
    </div>
  );
}