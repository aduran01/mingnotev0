import { useEffect, useRef, useState, useCallback } from "react";
import { state, Attribute } from "../../lib/store";
import { useSnapshot } from "valtio";
import { loadCharacter, saveCharacter, importCharacterImage } from "../../lib/ipc";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";

/* ------------------------------ helpers ------------------------------ */

function isHttpUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw);
}
function isPdf(path: string): boolean {
  return /\.pdf(\?.*)?$/i.test(path);
}
function looksAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\\/]/.test(p) || /^\\\\/.test(p) || p.startsWith("/");
}
function normSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

/* ------------------------------ types ------------------------------ */

type Character = {
  id: string;
  name: string;
  imagePath?: string; // relative (preferred) or absolute (fallback)
};

/* ------------------------------ component ------------------------------ */

export default function CharacterEditor() {
  const s = useSnapshot(state);
  const autosaveTimer = useRef<number | undefined>(undefined);
  const cacheSeed = useRef<number>(Date.now());

  const [imageUrl, setImageUrl] = useState<string>(""); // the actual <img>/<object> src
  const [imgErr, setImgErr] = useState<string>("");

  /** Build a WebView-safe URL (with cache-buster) for any path/URL. */
  const buildDisplayUrl = useCallback(
    async (raw: string): Promise<string> => {
      try {
        if (!raw) return "";
        if (isHttpUrl(raw)) return `${raw}${raw.includes("?") ? "&" : "?"}v=${Date.now()}`;

        let pathOnDisk = normSlashes(raw);
        if (!looksAbsolutePath(pathOnDisk)) {
          // resolve relative project path to absolute
          pathOnDisk = await join(state.projectPath, pathOnDisk);
        }
        const url = convertFileSrc(pathOnDisk);
        return `${url}?v=${Date.now()}`;
      } catch {
        return "";
      }
    },
    [s.projectPath]
  );

  /* --- load character on change --- */
  useEffect(() => {
    (async () => {
      if (!s.projectPath || !s.currentCharId) return;
      const data = await loadCharacter(s.projectPath, s.currentCharId);

      state.charEditor.age = data.age ?? "";
      state.charEditor.nationality = data.nationality ?? "";
      state.charEditor.sexuality = data.sexuality ?? "";
      state.charEditor.height = data.height ?? "";

      // attributes: accept array or JSON string
      let attrs: Attribute[] = [];
      if (Array.isArray(data.attributes)) attrs = data.attributes as Attribute[];
      else if (typeof data.attributes === "string" && data.attributes.trim()) {
        try {
          const parsed = JSON.parse(data.attributes);
          if (Array.isArray(parsed)) attrs = parsed as Attribute[];
        } catch {}
      }
      state.charEditor.attributes = attrs;

      // image field naming variations
      state.charEditor.image = (data.image ?? data.image_path ?? "") || "";
      const url = await buildDisplayUrl(state.charEditor.image);
      setImageUrl(url);
      setImgErr("");
    })();
  }, [s.projectPath, s.currentCharId, buildDisplayUrl]);

  /* --- recompute preview if image or project path changes --- */
  useEffect(() => {
    (async () => {
      const url = await buildDisplayUrl(s.charEditor.image);
      setImageUrl(url);
      setImgErr("");
    })();
  }, [s.charEditor.image, s.projectPath, buildDisplayUrl]);

  /* --- autosave every 5s --- */
  useEffect(() => {
    if (autosaveTimer.current) window.clearInterval(autosaveTimer.current);
    autosaveTimer.current = window.setInterval(async () => {
      if (!s.currentCharId) return;
      try {
        await saveCharacter(state.projectPath, state.currentCharId, {
          age: state.charEditor.age,
          nationality: state.charEditor.nationality,
          sexuality: state.charEditor.sexuality,
          height: state.charEditor.height,
          attributes: state.charEditor.attributes,
          image: state.charEditor.image,
        });
        state.charEditor.lastSaved = Date.now();
      } catch {}
    }, 5000) as unknown as number;

    return () => {
      if (autosaveTimer.current) window.clearInterval(autosaveTimer.current);
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

  const persistNow = async () => {
    if (!s.currentCharId) return;
    await saveCharacter(state.projectPath, s.currentCharId, {
      age: state.charEditor.age,
      nationality: state.charEditor.nationality,
      sexuality: state.charEditor.sexuality,
      height: state.charEditor.height,
      attributes: state.charEditor.attributes,
      image: state.charEditor.image,
    });
    state.charEditor.lastSaved = Date.now();
  };

/* --- pick image: instant preview from picked path, then switch to saved relative path --- */
const onPickImage = async () => {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [
      { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] },
      { name: "PDF", extensions: ["pdf"] },
    ],
  });
  if (!picked || typeof picked !== "string") return;

  // 1) Instant preview from OS path (cache-busted)
  cacheSeed.current = Date.now();
  const immediate = convertFileSrc(picked) + `?v=${cacheSeed.current}`;
  console.debug("[CharacterEditor] immediate preview url:", immediate);
  setImageUrl(immediate);
  setImgErr("");

  try {
    // 2) Import into project; backend SHOULD return a project-relative path like:
    //    assets/characters/<id>/photo.png
    let rel = await importCharacterImage(state.projectPath, state.currentCharId, picked);

    // Normalize slashes just in case (Windows backslashes)
    rel = rel.replace(/\\/g, "/");

    // 3) Persist immediately so state & DB match
    state.charEditor.image = rel;
    await persistNow();

    // 4) Swap preview to saved project-relative path
    const savedUrl = await buildDisplayUrl(rel);

    // --- Diagnostics you requested ---
    console.debug("[CharacterEditor] final imageUrl:", savedUrl);
    if (!savedUrl.startsWith("tauri://localhost/")) {
      console.warn(
        "[CharacterEditor] imageUrl is not a tauri://localhost URL; check CSP and returned path"
      );
      console.log("projectPath:", state.projectPath);
      console.log("stored image (should be project-relative):", rel);
    }

    setImageUrl(savedUrl);
    setImgErr("");
  } catch (e) {
    console.error("importCharacterImage failed:", e);
    // keep the immediate preview; surface a gentle UI hint
    setImgErr(
      "Could not import the file into the project. Previewing original path."
    );
  }
};

  /* ------------------------------ UI ------------------------------ */

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
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 style={{ margin: 0, marginBottom: 12, fontSize: "1.2rem" }}>Character image</h2>

        {imageUrl ? (
          isPdf(s.charEditor.image) ? (
            <object
              key={imageUrl}
              data={imageUrl}
              type="application/pdf"
              style={{
                width: "100%",
                height: 300,
                marginBottom: 8,
                border: "1px solid var(--color-border)",
                borderRadius: 8,
              }}
            >
              <p style={{ margin: 0, padding: 8 }}>
                PDF preview not supported here.{" "}
                <a href={imageUrl} target="_blank" rel="noreferrer">
                  Open PDF
                </a>
              </p>
            </object>
          ) : (
            <img
              key={imageUrl /* force rerender on URL change */}
              src={imageUrl}
              alt="Character"
              style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain", marginBottom: 8 }}
              onError={() => {
                // if CSP/path fails, collapse gracefully
                setImgErr("Failed to load image.");
                setImageUrl("");
              }}
              onLoad={() => setImgErr("")}
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

        {imgErr && (
          <div style={{ color: "var(--color-warning)", fontSize: 12, marginBottom: 8 }}>{imgErr}</div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={onPickImage}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              cursor: "pointer",
            }}
            aria-label="Pick an image"
          >
            Add image
          </button>
        </div>
      </div>

      {/* Profile fields */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 style={{ margin: 0, marginBottom: 12, fontSize: "1.2rem" }}>Profile details</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 8,
          }}
        >
          <input
            placeholder="Age"
            value={s.charEditor.age}
            onChange={(e) => (state.charEditor.age = e.target.value)}
            onBlur={persistNow}
            style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
            aria-label="Age"
          />
          <input
            placeholder="Nationality"
            value={s.charEditor.nationality}
            onChange={(e) => (state.charEditor.nationality = e.target.value)}
            onBlur={persistNow}
            style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
            aria-label="Nationality"
          />
          <input
            placeholder="Sexuality"
            value={s.charEditor.sexuality}
            onChange={(e) => (state.charEditor.sexuality = e.target.value)}
            onBlur={persistNow}
            style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
            aria-label="Sexuality"
          />
          <input
            placeholder="Height"
            value={s.charEditor.height}
            onChange={(e) => (state.charEditor.height = e.target.value)}
            onBlur={persistNow}
            style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
            aria-label="Height"
          />
        </div>
      </div>

      {/* Attributes */}
      <div className="card" style={{ padding: 16, flex: 1, overflowY: "auto" }}>
        <h2 style={{ margin: 0, marginBottom: 12, fontSize: "1.2rem" }}>Attributes</h2>
        {s.charEditor.attributes.map((attr, idx) => (
          <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input
              placeholder="Attribute name"
              value={attr.key}
              onChange={(e) => (state.charEditor.attributes[idx] = { ...attr, key: e.target.value })}
              onBlur={persistNow}
              style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--color-border)", minWidth: 0 }}
              aria-label="Attribute name"
            />
            <input
              placeholder="Value"
              value={attr.value}
              onChange={(e) => (state.charEditor.attributes[idx] = { ...attr, value: e.target.value })}
              onBlur={persistNow}
              style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--color-border)", minWidth: 0 }}
              aria-label="Attribute value"
            />
            <button
              onClick={() => {
                state.charEditor.attributes.splice(idx, 1);
                void persistNow();
              }}
              title="Remove attribute"
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer" }}
              aria-label="Remove attribute"
            >
              🗑
            </button>
          </div>
        ))}

        <button
          onClick={() => {
            state.charEditor.attributes.push({ key: "", value: "" });
            void persistNow();
          }}
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
