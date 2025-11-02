import React, { useMemo } from "react";
import { marked } from "marked";

/**
 * MarkdownPreview
 *
 * This component renders a live preview of a Markdown document.  It
 * preprocesses the raw Markdown string before passing it through
 * `marked` so that inline comments (the `// comment //` syntax) are
 * replaced with a styled span.  Inline comments are bolded and
 * wrapped in a shaded box to visually separate them from the rest of
 * the content.  The replacement occurs only in the HTML output and
 * does not modify the underlying Markdown source.  Because the
 * `stripComments` regular expression runs in the Editor, these
 * comments are already ignored by the word and character counters.
 */
export default function MarkdownPreview({ md }: { md: string }) {
  // Preprocess the markdown to replace inline comments with a
  // highlighted span.  The `gs` flags allow the expression to match
  // across newlines and replace all occurrences.
  const html = useMemo(() => {
    if (!md) return "";
    // Replace // comment // with a styled span.  The non-greedy
    // qualifier ensures that only text up to the next occurrence of
    // `//` is captured, preventing runaway replacements.
    const processed = md.replace(/\/\/(.*?)\/\//gs, (_match, p1) => {
      const escaped = p1
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<span class="inline-comment">${escaped}</span>`;
    });
    return marked.parse(processed);
  }, [md]);

  return (
    <div
      className="markdown-preview"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        marginTop: 16,
        padding: 12,
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflowY: "auto",
        maxHeight: "40vh",
        background: "var(--color-surface)",
      }}
    />
  );
}