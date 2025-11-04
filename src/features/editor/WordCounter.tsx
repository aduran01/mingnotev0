import React, { useEffect, useRef, useState } from "react";

interface WordCounterProps {
  count: number;
  label: string;
  color?: string;
  anchor?: "left" | "right";
  storageKey?: string;
  onClick?: () => void;
}

const WordCounter: React.FC<WordCounterProps> = ({
  count,
  label,
  color = "#f9a8d4",
  anchor = "left",
  storageKey,
  onClick,
}) => {
  const key = storageKey || `mingnote-${label.toLowerCase().replace(/\s+/g, "")}--pos`;

  // Store absolute left/bottom so dragging direction is always natural.
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          return parsed;
        }
      }
    } catch {}
    // Default position: 20px from bottom; 20px from left or right edge.
    const defaultX = anchor === "right" ? Math.max(20, window.innerWidth - 140) : 20;
    return { x: defaultX, y: 20 };
  });

  // Persist position
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(pos));
    } catch {}
  }, [pos, key]);

  // Keep within viewport on resize
  useEffect(() => {
    const onResize = () => {
      setPos((p) => ({
        x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - 120)),
        y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - 40)),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isDragging = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const init = useRef({ x: 0, y: 0 });

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
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
    left: pos.x,
    background: color,
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: "0.8rem",
    userSelect: "none",
    cursor: onClick ? "pointer" : "move",
    zIndex: 1000,
  };

  return (
    <div style={style} onMouseDown={onMouseDown} aria-label={`${label} counter`}>
      {label}: {count}
    </div>
  );
};

export default WordCounter;
