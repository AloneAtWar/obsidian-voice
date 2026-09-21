import {
  locateHeading,
  splitMarkdownByHeading,
} from "../src/utils/textSections";

describe("Unit Tests - splitMarkdownByHeading", () => {
  test("returns a single untitled section when there are no headings", () => {
    const sections = splitMarkdownByHeading("hello\n\nworld");
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("");
    expect(sections[0].markdown).toBe("hello\n\nworld");
    expect(sections[0].isPreamble).toBe(true);
    expect(sections[0].startLine).toBe(0);
  });

  test("splits on ATX headings and keeps the heading in the body", () => {
    const markdown = [
      "preamble",
      "",
      "# One",
      "alpha",
      "",
      "## Two",
      "beta",
    ].join("\n");
    const sections = splitMarkdownByHeading(markdown);
    expect(sections.map((s) => s.title)).toEqual([
      "Introduction",
      "One",
      "Two",
    ]);
    expect(sections[1].markdown).toContain("# One");
    expect(sections[1].markdown).toContain("alpha");
    expect(sections[2].markdown).toContain("beta");
    expect(sections[0].startLine).toBe(0);
    expect(sections[1].startLine).toBe(2);
    expect(sections[2].startLine).toBe(5);
    expect(sections[1].occurrence).toBe(0);
    expect(sections[1].isPreamble).toBe(false);
  });

  test("counts duplicate titles as separate occurrences", () => {
    const sections = splitMarkdownByHeading("# Foo\nA\n# Foo\nB");
    expect(sections.map((s) => s.occurrence)).toEqual([0, 1]);
    expect(sections.map((s) => s.startLine)).toEqual([0, 2]);
  });

  test("ignores headings inside fenced code blocks", () => {
    const markdown = ["# Real", "```", "# Fake", "```", "body"].join("\n");
    const sections = splitMarkdownByHeading(markdown);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Real");
    expect(sections[0].markdown).toContain("# Fake");
  });
});

describe("Unit Tests - locateHeading (stale audio vs edited note)", () => {
  const original = ["# One", "aaa", "# Two", "bbb"].join("\n");
  const sections = splitMarkdownByHeading(original);
  const two = sections[1];

  test("finds a heading that moved because lines were inserted above", () => {
    const edited = ["new line", "", ...original.split("\n")].join("\n");
    const line = locateHeading(edited, {
      title: two.title,
      occurrence: two.occurrence,
      startLine: two.startLine,
      isPreamble: false,
    });
    expect(line).toBe(4);
  });

  test("returns null when the heading was renamed (audio is stale)", () => {
    const edited = ["# One", "aaa", "# Two renamed", "bbb"].join("\n");
    const line = locateHeading(edited, {
      title: "Two",
      occurrence: 0,
      startLine: 2,
      isPreamble: false,
    });
    expect(line).toBeNull();
  });

  test("uses occurrence to tell duplicate titles apart", () => {
    const markdown = ["# Foo", "a", "# Foo", "b"].join("\n");
    expect(
      locateHeading(markdown, {
        title: "Foo",
        occurrence: 1,
        startLine: 2,
        isPreamble: false,
      }),
    ).toBe(2);
  });

  test("preamble always maps to the start of the file", () => {
    expect(
      locateHeading("changed\n\n# Later", {
        title: "Introduction",
        occurrence: 0,
        startLine: 0,
        isPreamble: true,
      }),
    ).toBe(0);
  });
});
