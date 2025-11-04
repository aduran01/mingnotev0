import * as React from "react";
import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import CharacterEditor from "./CharacterEditor";
import DocEditor from "./DocEditor";

export default function Editor() {
  const s = useSnapshot(state);

  // Pure router: no hooks that would change order across renders.
  if (!s.projectPath) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
        }}
      >
        <p style={{ fontSize: "1.2rem" }}>Open a New Project!</p>
      </div>
    );
  }

  if (s.currentCharId) {
    return <CharacterEditor />;
  }

  return <DocEditor />;
}
