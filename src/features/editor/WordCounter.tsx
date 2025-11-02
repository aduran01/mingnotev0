import React, { useEffect, useRef, useState } from "react";

interface WordCounterProps {
  /**
   * The numeric value to display.  For example, the word count or
   * character count.
   */
  count: number;
  /** Label shown next to the count. */
  label: string;
  /**
   * Optional background colour.  Defaults to a soft pink in keeping
   * with the MingNote palette.
   */
  color?: string;
  /**
   * Which side of the viewport the counter should attach to.  Left
   * counters position themselves relative to the left edge; right
   * counters to the right edge.
   */
  anchor?: "left" | "right";
  /**
   * Custom key used to persist the counter's position across
   * sessions.  If omitted, a key is derived from the label.
   */
  storageKey?: string;
  /**
   * Optional click handler.  When provided, clicking the counter
   * invokes this callback rather than initiating a drag.  This is
   * used by the Editor to toggle the visibility of the character
   * count when the word count is clicked.
   */
  onClick?: () => void;
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
  onClick,
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
    // Prevent default to stop text selection on double-click
    e.preventDefault();
    // If a click handler is provided, invoke it and return.  Do not
    // start a drag interaction when clicking to toggle.
    if (onClick) {
      onClick();
      return;
    }
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
    cursor: onClick ? "pointer" : "move",
    zIndex: 1000,
  };

  return (
    <div
      style={style}
      onMouseDown={onMouseDown}
      aria-label={`${label} counter`}
    >
      {label}: {count}
    </div>
  );
};

export default WordCounter;