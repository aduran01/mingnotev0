import React, { useEffect, useRef, useState } from "react";

interface WordCounterProps {
  count: number;
  label: string;
  color?: string;
  anchor?: "left" | "right";
  storageKey?: string;
}

/**
 * Draggable floating counter.  It uses localStorage to remember its
 * position across sessions.  The `anchor` prop controls whether it
 * attaches to the left or right side of the viewport.
 */
const WordCounter: React.FC<WordCounterProps> = ({
  count,
  label,
  color = "#f9a8d4",
  anchor = "left",
  storageKey,
}) => {
  const key =
    storageKey || `mingnote-${label.toLowerCase().replace(/\s+/g, "")}--pos`;
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          return parsed;
        }
      }
    } catch {
      /* ignore */
    }
    return { x: 20, y: 20 };
  });

  // Persist position whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, [pos, key]);

  const isDragging = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const init = useRef({ x: 0, y: 0 });

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDragging.current = true;
    start.current = { x: e.clientX, y: e.clientY };
    init.current = { ...pos };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    setPos({ x: init.current.x + dx, y: init.current.y + dy });
  };

  const onMouseUp = () => {
    isDragging.current = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  const style: React.CSSProperties = {
    position: "fixed",
    bottom: pos.y,
    ...(anchor === "left" ? { left: pos.x } : { right: pos.x }),
    background: color,
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: "0.8rem",
    userSelect: "none",
    cursor: "move",
    zIndex: 1000,
  };

  return (
    <div style={style} onMouseDown={onMouseDown} aria-label={`${label} counter`}>
      {label}: {count}
    </div>
  );
};

export default WordCounter;
