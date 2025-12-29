import { ReactNode } from "react";

const LINK_REGEX = /(GitHub|Demo):\s*((?:https?:\/\/|www\.)[^\s)]+)/gi;

/**
 * Normalize various bold marker formats to standard markdown **text**.
 * Handles:
 * - __MARKDOWN_BOLD_START__ ... __MARKDOWN_BOLD_END__
 * - \_\_MARKDOWN\_BOLD\_START\_\_ (escaped underscores)
 * - Already standard **text**
 */
function normalizeBoldMarkers(text: string): string {
  // Handle escaped underscore version first (from LaTeX escaping gone wrong)
  let result = text
    .replace(/\\_\\_MARKDOWN\\_BOLD\\_START\\_\\_/g, "**")
    .replace(/\\_\\_MARKDOWN\\_BOLD\\_END\\_\\_/g, "**");
  
  // Handle unescaped version
  result = result
    .replace(/__MARKDOWN_BOLD_START__/g, "**")
    .replace(/__MARKDOWN_BOLD_END__/g, "**");
  
  return result;
}

function linkifyText(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  LINK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const previousSegment = text.slice(lastIndex, match.index);
      if (previousSegment.length > 0) {
        nodes.push(previousSegment);
      }
    }
    nodes.push(`${match[1]}: `);
    const rawUrl = match[2];
    const href = rawUrl.toLowerCase().startsWith("http")
      ? rawUrl
      : `https://${rawUrl}`;
    nodes.push(
      <a
        key={`${keyPrefix}-link-${match.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {rawUrl}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const trailingSegment = text.slice(lastIndex);
    if (trailingSegment.length > 0) {
      nodes.push(trailingSegment);
    }
  }

  return nodes.length > 0 ? nodes : [text];
}

export function renderRichText(text?: string): ReactNode {
  if (!text) {
    return text || null;
  }

  const normalizedText = normalizeBoldMarkers(text);
  const fragments: ReactNode[] = [];
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = boldRegex.exec(normalizedText)) !== null) {
    if (match.index > lastIndex) {
      fragments.push(normalizedText.slice(lastIndex, match.index));
    }
    fragments.push(
      <strong key={`rich-bold-${match.index}`}>{match[1]}</strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < normalizedText.length) {
    fragments.push(normalizedText.slice(lastIndex));
  }

  const nodes: ReactNode[] = [];
  fragments.forEach((fragment, idx) => {
    if (typeof fragment === "string") {
      nodes.push(...linkifyText(fragment, `rich-${idx}`));
    } else {
      nodes.push(fragment);
    }
  });

  if (nodes.length === 0) {
    return null;
  }
  if (nodes.length === 1) {
    return nodes[0];
  }
  return <>{nodes}</>;
}
