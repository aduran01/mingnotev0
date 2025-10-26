import { useEffect, useRef } from "react";
import { state, Attribute } from "../../lib/store";
import { useSnapshot } from "valtio";
import { loadCharacter, saveCharacter } from "../../lib/ipc";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { importCharacterImage } from "../../lib/ipc";

function toDisplayUrl(raw: string): string {
  if (!raw) return "";
  // If it's already an http(s) URL, just use it
  if (/^https?:\/\//i.test(raw)) return raw;
  // Otherwise assume it's a file path and convert for the webview
  return convertFileSrc(raw);
}

function isPdf(path: string): boolean {
  return /\.pdf(\?.*)?$/i.test(path);
}

const onPickImage = async () => {
  // open system file picker
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

  // Copy the selected file into the project so it remains portable
  const destAbsPath = await importCharacterImage(state.projectPath, state.currentCharId, picked);

  // Save path and persist
  state.charEditor.image = destAbsPath;
  await saveCharacter(state.projectPath, state.currentCharId, {
    age: state.charEditor.age,
    nationality: state.charEditor.nationality,
    sexuality: state.charEditor.sexuality,
    height: state.charEditor.height,
    attributes: state.charEditor.attributes,
    image: destAbsPath,
  });
  state.charEditor.lastSaved = Date.now();
};




export default function CharacterEditor() {
  const s = useSnapshot(state);
  const timer = useRef<number | undefined>(undefined);

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
      state.charEditor.image = data.image ?? data.image_path ?? "";
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
        await saveCharacter(s.projectPath, s.currentCharId, payload);
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
    await saveCharacter(s.projectPath, s.currentCharId, payload);
    state.charEditor.lastSaved = Date.now();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      {/* Image and image picker */}
<div className="card" style={{ margin: 12, padding: 12 }}>
  {s.charEditor.image ? (
    isPdf(s.charEditor.image) ? (
      <object
        data={toDisplayUrl(s.charEditor.image)}
        type="application/pdf"
        style={{ width: "100%", height: 300, marginBottom: 8, border: "1px solid var(--border)", borderRadius: 8 }}
      >
        <p style={{ margin: 0, padding: 8 }}>
          PDF preview not supported here.{" "}
          <a href={toDisplayUrl(s.charEditor.image)} target="_blank" rel="noreferrer">Open PDF</a>
        </p>
      </object>
    ) : (
      <img
        src={toDisplayUrl(s.charEditor.image)}
        alt="Character"
        style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain", marginBottom: 8 }}
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

  <div style={{ display: "flex", gap: 8 }}>
    <button
      onClick={onPickImage}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--card)",
        cursor: "pointer",
      }}
    >
      + Add Image
    </button>

    {/* keep direct URL entry as a power-user option */}
    <input
      type="text"
      placeholder="Paste image/PDF URL or local path"
      value={s.charEditor.image}
      onChange={(e) => (state.charEditor.image = e.target.value)}
      onBlur={onBlur}
      style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}
    />
  </div>
</div>


      {/* Profile fields: 4 horizontal boxes */}
      <div className="card" style={{ margin: 12, padding: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
          }}
        >
          <input
            placeholder="Age"
            value={s.charEditor.age}
            onChange={(e) => (state.charEditor.age = e.target.value)}
            onBlur={onBlur}
            style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}
          />
          <input
            placeholder="Nationality"
            value={s.charEditor.nationality}
            onChange={(e) => (state.charEditor.nationality = e.target.value)}
            onBlur={onBlur}
            style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}
          />
          <input
            placeholder="Sexuality"
            value={s.charEditor.sexuality}
            onChange={(e) => (state.charEditor.sexuality = e.target.value)}
            onBlur={onBlur}
            style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}
          />
          <input
            placeholder="Height"
            value={s.charEditor.height}
            onChange={(e) => (state.charEditor.height = e.target.value)}
            onBlur={onBlur}
            style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}
          />
        </div>
      </div>

      {/* Attributes */}
      <div className="card" style={{ margin: 12, padding: 12, flex: 1, overflowY: "auto" }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Attributes</div>
        {s.charEditor.attributes.map((attr, idx) => (
          <div key={idx} style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            <input
              placeholder="Attribute name"
              value={attr.key}
              onChange={(e) => {
                state.charEditor.attributes[idx] = { ...attr, key: e.target.value };
              }}
              onBlur={onBlur}
              style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--border)" }}
            />
            <input
              placeholder="Value"
              value={attr.value}
              onChange={(e) => {
                state.charEditor.attributes[idx] = { ...attr, value: e.target.value };
              }}
              onBlur={onBlur}
              style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--border)" }}
            />
            <button
              onClick={() => {
                state.charEditor.attributes.splice(idx, 1);
              }}
              title="Remove attribute"
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--card)",
                cursor: "pointer",
              }}
            >
              🗑
            </button>
          </div>
        ))}

        <button
          onClick={() => {
            state.charEditor.attributes.push({ key: "", value: "" });
          }}
          style={{
            marginTop: 4,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--card)",
            cursor: "pointer",
          }}
        >
          + Add Attribute
        </button>
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", padding: "0 16px 12px", alignSelf: "flex-end" }}>
        Saved {s.charEditor.lastSaved ? new Date(s.charEditor.lastSaved).toLocaleTimeString() : "—"}
      </div>
    </div>
  );
}
