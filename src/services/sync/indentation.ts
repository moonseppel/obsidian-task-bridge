/** Obsidian's own default, and what the plugin falls back to when the editor's setting can't be read. */
export const DEFAULT_TAB_SIZE = 4;

interface ScannedWhitespace {
  /** The character offset just past each complete indent level, in order. */
  readonly levelEnds: readonly number[];
  readonly whitespaceLength: number;
}

/**
 * How deep a line is indented, under one vault's tab size. Obsidian writes a soft-break
 * continuation inside a list item with spaces even in a tab-indented vault, so a complete run of
 * `tabSize` spaces has to count exactly as a tab does. Every reader of a note's indentation counts
 * through this one object, so no two of them can disagree (spec 0.10.2, Architecture 1).
 */
export class Indentation {
  private readonly tabSize: number;

  constructor(tabSize: number = DEFAULT_TAB_SIZE) {
    this.tabSize = tabSize;
  }

  levelOf(line: string): number {
    return this.scan(line).levelEnds.length;
  }

  levelsBelow(line: string, taskLine: string): number {
    return this.levelOf(line) - this.levelOf(taskLine);
  }

  /** The spaces after the last complete level: content indentation inside a line, not a level of its own. */
  leftoverSpaces(line: string): number {
    const { levelEnds, whitespaceLength } = this.scan(line);

    return whitespaceLength - (levelEnds[levelEnds.length - 1] ?? 0);
  }

  /** Removes whole levels from the front, each a tab or a full run of spaces, leaving the leftovers. */
  removeLevels(line: string, count: number): string {
    const { levelEnds } = this.scan(line);
    const removed = Math.min(count, levelEnds.length);

    return removed === 0 ? line : line.slice(levelEnds[removed - 1]);
  }

  /**
   * Reads the leading whitespace left to right: a tab is one level and drops whatever spaces were
   * pending, so an incomplete run followed by a tab is discarded with it; every complete run of
   * `tabSize` spaces is one level. Since any tab closes a level, whatever whitespace follows the
   * last level is spaces alone.
   */
  private scan(line: string): ScannedWhitespace {
    const levelEnds: number[] = [];
    let pendingSpaces = 0;
    let index = 0;

    for (; index < line.length && (line[index] === '\t' || line[index] === ' '); index += 1) {
      pendingSpaces = line[index] === '\t' ? 0 : pendingSpaces + 1;

      if (line[index] === '\t' || pendingSpaces === this.tabSize) {
        pendingSpaces = 0;
        levelEnds.push(index + 1);
      }
    }

    return { levelEnds, whitespaceLength: index };
  }
}

/** For a reader with no vault setting to hand — every note fixture in the offline suite, notably. */
export const DEFAULT_INDENTATION = new Indentation(DEFAULT_TAB_SIZE);

/**
 * Anything but a whole number above 0 counts as no tab size at all and falls back to the default:
 * an absent `getConfig`, a setting that was never written, or a value of a shape this plugin does
 * not recognize. The fallback leaves behaviour exactly as it was before tab size was read at all.
 */
export function indentationOf(tabSize: unknown): Indentation {
  return isUsableTabSize(tabSize) ? new Indentation(tabSize) : DEFAULT_INDENTATION;
}

function isUsableTabSize(tabSize: unknown): tabSize is number {
  return typeof tabSize === 'number' && Number.isInteger(tabSize) && tabSize > 0;
}
