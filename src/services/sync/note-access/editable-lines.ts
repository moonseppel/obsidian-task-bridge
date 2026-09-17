import { DEFAULT_INDENTATION, Indentation } from '../task-format/indentation';
import { leadingWhitespace } from '../task-format/task-description';
import { reindentBlock, subtreeSpan } from '../task-format/task-tree';

interface Line {
  /** Where the pass read this line, or undefined for a line the edits added. */
  readonly origin: number | undefined;
  text: string;
}

/**
 * A note's lines, each remembering where the pass read it. Edits find their lines by that origin
 * wherever earlier edits have since moved them, so edits touching the same lines compose instead of
 * the last one overwriting the rest, and a line keeps every change made to it wherever it ends up.
 */
export class EditableLines {
  private lines: Line[];
  private readonly indentation: Indentation;

  constructor(original: readonly string[], indentation = DEFAULT_INDENTATION) {
    this.lines = original.map((text, origin) => ({ origin, text }));
    this.indentation = indentation;
  }

  replace(origin: number, text: string): void {
    const position = this.positionOf(origin);

    if (position !== undefined) {
      this.lines[position].text = text;
    }
  }

  removeAll(origins: readonly number[]): void {
    const removed = new Set(origins);

    this.lines = this.lines.filter((line) => line.origin === undefined || !removed.has(line.origin));
  }

  insertAfter(origin: number, texts: readonly string[]): void {
    const position = this.positionOf(origin);

    if (position !== undefined) {
      this.lines.splice(position + 1, 0, ...added(texts));
    }
  }

  /** After everything nested under the line as it reads now: its description and its whole subtree. */
  insertUnder(origin: number, texts: readonly string[]): void {
    const position = this.positionOf(origin);

    if (position !== undefined) {
      this.lines.splice(this.subtreeEnd(position), 0, ...added(texts));
    }
  }

  /** Carries a task line and its subtree under a new parent's existing content, rebased onto its indent. */
  moveUnder(origin: number, newParentOrigin: number): void {
    const position = this.positionOf(origin);
    const parentPosition = this.positionOf(newParentOrigin);

    if (position === undefined || parentPosition === undefined) {
      return;
    }

    const end = this.subtreeEnd(position);

    if (parentPosition >= position && parentPosition < end) {
      return;
    }

    const moved = this.lines.splice(position, end - position);
    const newParentPosition = parentPosition < position ? parentPosition : parentPosition - moved.length;

    rebase(moved, `${leadingWhitespace(this.lines[newParentPosition].text)}\t`);
    this.lines.splice(this.subtreeEnd(newParentPosition), 0, ...moved);
  }

  /** Rebases a task line and its subtree onto a new indentation, leaving them where they are. */
  reindent(origin: number, indent: string): void {
    const position = this.positionOf(origin);

    if (position !== undefined) {
      rebase(this.lines.slice(position, this.subtreeEnd(position)), indent);
    }
  }

  texts(): string[] {
    return this.lines.map((line) => line.text);
  }

  private positionOf(origin: number): number | undefined {
    const position = this.lines.findIndex((line) => line.origin === origin);

    return position === -1 ? undefined : position;
  }

  private subtreeEnd(position: number): number {
    return subtreeSpan(this.texts(), position, this.indentation).endLineExclusive;
  }
}

function added(texts: readonly string[]): Line[] {
  return texts.map((text) => ({ origin: undefined, text }));
}

function rebase(lines: readonly Line[], newBaseIndent: string): void {
  const oldBaseIndent = leadingWhitespace(lines[0]?.text ?? '');
  const rebased = reindentBlock(lines.map((line) => line.text), oldBaseIndent, newBaseIndent);

  lines.forEach((line, index) => {
    line.text = rebased[index];
  });
}
