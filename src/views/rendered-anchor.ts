/** Only this plugin's own anchors are hidden; block ids the user wrote stay visible. */
const TRAILING_ANCHOR = /[ \t]*\^ots-[a-z0-9]+[ \t]*$/;
const TEXT_NODE = 3;

export function stripTrailingAnchor(text: string): string {
  return text.replace(TRAILING_ANCHOR, '');
}

/**
 * Reading view offers no class to style a block id with, so the rendered text is edited instead.
 * Only the rendered copy changes; the note on disk keeps its anchor.
 */
export function hideRenderedAnchors(root: Node): void {
  forEachTextNode(root, (node) => {
    const stripped = stripTrailingAnchor(node.textContent ?? '');

    if (stripped !== node.textContent) {
      node.textContent = stripped;
    }
  });
}

function forEachTextNode(node: Node, visit: (textNode: Node) => void): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      visit(child);
    } else {
      forEachTextNode(child, visit);
    }
  }
}
