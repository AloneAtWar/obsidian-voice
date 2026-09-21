import { MarkdownView, TFile, App, Platform, Notice } from "obsidian";
import {
  locateHeading,
  type HeadingJumpTarget,
} from "./textSections";

/**
 * Outcome of reading the note to speak: the text on success, or a reason the
 * caller can turn into friendly user feedback. Returning a result (rather than
 * a sentinel string) keeps an error message from being read aloud as content.
 */
export type NoteReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no-note" | "read-error" };

export class MarkdownHelper {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async getMarkdownView(): Promise<NoteReadResult> {
    // First, try the active MarkdownView: read its selection if any, else all.
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      const selectedText = activeView.editor.getSelection();
      return {
        ok: true,
        text: selectedText ? selectedText : activeView.editor.getValue(),
      };
    }

    // No MarkdownView is active — this is the case when reading is triggered
    // from the Voice player pane (the player becomes the active view). Fall back
    // to the markdown view that shows the active file so a text selection there
    // is still honored; only read the whole file when there is no selection.
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && activeFile instanceof TFile) {
      const fileView = this.app.workspace
        .getLeavesOfType("markdown")
        .map((leaf) => leaf.view)
        .find(
          (view): view is MarkdownView =>
            view instanceof MarkdownView && view.file === activeFile,
        );
      if (fileView) {
        const selectedText = fileView.editor.getSelection();
        if (selectedText) {
          return { ok: true, text: selectedText };
        }
      }

      try {
        // No selection (or no open editor) — read the file content directly.
        return { ok: true, text: await this.app.vault.cachedRead(activeFile) };
      } catch (error) {
        console.error("Error reading active file:", error);
        return { ok: false, reason: "read-error" };
      }
    }

    // No note is open to read.
    return { ok: false, reason: "no-note" };
  }

  getActiveFilePath(): string | null {
    const activeFile = this.app.workspace.getActiveFile();
    return activeFile?.path || null;
  }

  /**
   * Scroll the live note to a playlist section. Re-reads the current editor
   * text so a heading that moved still resolves; if it was renamed or deleted
   * (audio is stale), shows a notice and does nothing.
   */
  async revealHeading(
    filePath: string | null,
    jump: HeadingJumpTarget | null,
  ): Promise<void> {
    if (!filePath || !jump) {
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      return;
    }

    let view = this.findMarkdownView(file);
    if (!view && !Platform.isMobile) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      if (leaf.view instanceof MarkdownView) {
        view = leaf.view;
      }
    }
    if (!view) {
      return;
    }

    const source = view.editor?.getValue() ?? (await this.app.vault.cachedRead(file));
    const line = locateHeading(source, jump);
    if (line === null) {
      new Notice(
        "That heading is gone from the note. The audio was generated from an older version.",
      );
      return;
    }

    if (view.editor) {
      const pos = { line, ch: 0 };
      view.editor.setCursor(pos);
      view.editor.scrollIntoView({ from: pos, to: pos }, true);
    }
    if (!Platform.isMobile) {
      await this.app.workspace.revealLeaf(view.leaf);
    }
  }

  private findMarkdownView(file: TFile): MarkdownView | null {
    const views = this.app.workspace
      .getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView);
    return views.find((view) => view.file === file) ?? null;
  }
}
