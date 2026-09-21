/**
 * Split markdown into heading-based sections for progressive TTS playback.
 *
 * Each ATX heading (`#` … `######`) starts a new section titled with that
 * heading's text. Content before the first heading is kept as its own section
 * ("Introduction"). Fenced code blocks are not scanned for headings.
 */

export interface MarkdownSection {
  /** Display title for the player's chapter list. */
  title: string;
  /** Markdown body of the section, including the heading line when present. */
  markdown: string;
  /** 0-based line in the source note where this section starts. */
  startLine: number;
  /**
   * Among headings that share `title`, which occurrence this is (0-based).
   * Unused for the preamble (`isPreamble`).
   */
  occurrence: number;
  /** True when this is the content before the first heading. */
  isPreamble: boolean;
}

/**
 * How to find a section in the live note. Title + occurrence survive inserts
 * above the heading; startLine is only a hint if the heading was renamed.
 */
export interface HeadingJumpTarget {
  title: string;
  occurrence: number;
  startLine: number;
  isPreamble: boolean;
}

const ATX_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export interface AtxHeading {
  title: string;
  line: number;
}

/** ATX headings in source order, ignoring fenced code. */
export function listAtxHeadings(markdown: string): AtxHeading[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headings: AtxHeading[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.trimStart();
    if (fence.startsWith("```") || fence.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const heading = ATX_HEADING.exec(line);
    if (heading) {
      headings.push({ title: heading[2].trim(), line: i });
    }
  }
  return headings;
}

/**
 * Re-find a section in the *current* note text. Prefers title + occurrence so
 * inserts/deletes above the heading still land correctly. Returns null when
 * that heading is gone (renamed or deleted) — the audio is then stale.
 */
export function locateHeading(
  markdown: string,
  jump: HeadingJumpTarget,
): number | null {
  if (jump.isPreamble) {
    return 0;
  }

  const headings = listAtxHeadings(markdown);
  const matches = headings.filter((heading) => heading.title === jump.title);
  if (matches.length === 0) {
    return null;
  }
  if (jump.occurrence >= 0 && jump.occurrence < matches.length) {
    return matches[jump.occurrence].line;
  }
  const atHint = matches.find((heading) => heading.line === jump.startLine);
  if (atHint) {
    return atHint.line;
  }
  if (matches.length === 1) {
    return matches[0].line;
  }
  return null;
}

export function jumpTargetFromSection(
  section: MarkdownSection,
): HeadingJumpTarget {
  return {
    title: section.title,
    occurrence: section.occurrence,
    startLine: section.startLine,
    isPreamble: section.isPreamble,
  };
}

export function splitMarkdownByHeading(markdown: string): MarkdownSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const buckets: {
    title: string;
    lines: string[];
    startLine: number;
    occurrence: number;
    isPreamble: boolean;
  }[] = [];
  let current = {
    title: "",
    lines: [] as string[],
    startLine: 0,
    occurrence: 0,
    isPreamble: true,
  };
  let inFence = false;
  const titleCounts = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.trimStart();
    if (fence.startsWith("```") || fence.startsWith("~~~")) {
      inFence = !inFence;
      current.lines.push(line);
      continue;
    }

    const heading = !inFence ? ATX_HEADING.exec(line) : null;
    if (heading) {
      if (current.title || current.lines.some((item) => item.trim())) {
        buckets.push(current);
      }
      const title = heading[2].trim();
      const seen = titleCounts.get(title) ?? 0;
      titleCounts.set(title, seen + 1);
      current = {
        title,
        lines: [line],
        startLine: i,
        occurrence: seen,
        isPreamble: false,
      };
      continue;
    }

    current.lines.push(line);
  }

  if (current.title || current.lines.some((item) => item.trim())) {
    buckets.push(current);
  }

  if (buckets.length === 0) {
    return [
      {
        title: "",
        markdown: markdown.trim(),
        startLine: 0,
        occurrence: 0,
        isPreamble: true,
      },
    ];
  }

  if (buckets.length > 1 && buckets[0].isPreamble && !buckets[0].title) {
    buckets[0].title = "Introduction";
  }

  return buckets.map((bucket) => ({
    title: bucket.title,
    markdown: bucket.lines.join("\n").trim(),
    startLine: bucket.startLine,
    occurrence: bucket.occurrence,
    isPreamble: bucket.isPreamble,
  }));
}
