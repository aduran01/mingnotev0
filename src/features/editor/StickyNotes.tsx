import React, { useEffect, useState, useRef } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";

const COLORS = ["#ff7eb9", "#ff65a3", "#7afcff", "#feff9c", "#fff740"];

interface Note {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
}

export default function StickyNotes() {
  const s = useSnapshot(state);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);

  // Load notes when projectPath changes
  useEffect(() => {
    if (!s.projectPath) return;
    try {
      const key = `mingnote-notes-${s.projectPath}`;
      const stored = localStorage.getItem(key);
      setNotes(stored ? (JSON.parse(stored) as Note[]) : []);
    } catch {
      setNotes([]);
    }
  }, [s.projectPath]);

  // Persist notes on change
  useEffect(() => {
    if (!s.projectPath) return;
    try {
      localStorage.setItem(
        `mingnote-notes-${s.projectPath}`,
        JSON.stringify(notes)
      );
    } catch {
      /* ignore */
    }
  }, [notes, s.projectPath]);

  const addNote = () => {
    const id = `note-${Date.now()}`;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    setNotes([...notes, { id, text: "", x: 100, y: 100, color }]);
  };

  const removeNote = (id: string) => {
    setNotes(notes.filter((n) => n.id !== id));
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        title={open ? "Close notes" : "Open notes"}
        style={{
          position: "fixed",
          right: open ? 320 : 20,
          bottom: 20,
          zIndex: 2000,
          borderRadius: "50%",
          padding: 8,
          fontSize: 18,
          background: "#f9a8d4",
          border: "none",
          cursor: "pointer",
          color: "black",
        }}
      >
        {open ? "✖" : "📝"}
      </button>
      {open && (
        <>
          <button
            onClick={addNote}
            style={{
              position: "fixed",
              right: 20,
              bottom: 80,
              zIndex: 2000,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#7afcff",
              cursor: "pointer",
            }}
          >
            + Note
          </button>
          {notes.map((note) => (
            <Sticky
              key={note.id}
              note={note}
              onChange={(updated) =>
                setNotes(notes.map((n) => (n.id === note.id ? updated : n)))
              }
              onDelete={() => removeNote(note.id)}
            />
          ))}
        </>
      )}
    </div>
  );
}

function Sticky({
  note,
  onChange,
  onDelete,
}: {
  note: Note;
  onChange: (n: Note) => void;
  onDelete: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setStartPos({ x: e.clientX - note.x, y: e.clientY - note.y });
    e.stopPropagation();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    const newX = e.clientX - startPos.x;
    const newY = e.clientY - startPos.y;
    onChange({ ...note, x: newX, y: newY });
  };

  const handleMouseUp = () => setDragging(false);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  return (
    <div
      style={{
        position: "fixed",
        top: note.y,
        left: note.x,
        width: 180,
        background: note.color,
        borderRadius: 8,
        padding: 8,
        zIndex: 2001,
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        cursor: "move",
      }}
      onMouseDown={handleMouseDown}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: 14,
        }}
        title="Delete note"
      >
        ×
      </button>
      <textarea
        value={note.text}
        onChange={(e) => onChange({ ...note, text: e.target.value })}
        placeholder="Note..."
        style={{
          width: "100%",
          height: 100,
          border: "none",
          background: "transparent",
          resize: "none",
          fontSize: 14,
        }}
      />
    </div>
  );
}
