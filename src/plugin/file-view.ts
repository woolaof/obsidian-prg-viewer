import { FileView, TFile, type WorkspaceLeaf } from "obsidian";
import type { Scene } from "../prg/scene";
import { PrgViewer } from "../viewer/viewer";

export const PRG_VIEW_TYPE = "prg-viewer-file";

export interface PrgFileViewHost {
  readScene(file: TFile): Promise<Scene>;
  renderError(el: HTMLElement, error: unknown, filePath?: string): void;
  trackViewer(viewer: PrgViewer): () => void;
  isUnloaded(): boolean;
}

export class PrgFileView extends FileView {
  override allowNoFile = false;

  private readonly host: PrgFileViewHost;
  private viewer: PrgViewer | null = null;
  private untrack: (() => void) | null = null;
  private loadId = 0;

  constructor(leaf: WorkspaceLeaf, host: PrgFileViewHost) {
    super(leaf);
    this.host = host;
    this.navigation = true;
    this.contentEl.classList.add("prg-viewer-host");
  }

  override getViewType(): string {
    return PRG_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return this.file?.basename ?? "PRG 预览";
  }

  override getIcon(): string {
    return "image";
  }

  override canAcceptExtension(extension: string): boolean {
    return extension === "prg";
  }

  override async onLoadFile(file: TFile): Promise<void> {
    const loadId = ++this.loadId;
    this.clearViewer();
    this.contentEl.replaceChildren();

    try {
      const scene = await this.host.readScene(file);
      if (
        loadId !== this.loadId ||
        (this.file && this.file !== file) ||
        this.host.isUnloaded()
      ) {
        return;
      }
      const viewer = new PrgViewer(this.contentEl, scene, {
        dark: document.body.classList.contains("theme-dark"),
        fill: true,
      });
      this.viewer = viewer;
      this.untrack = this.host.trackViewer(viewer);
    } catch (error) {
      if (loadId === this.loadId && !this.host.isUnloaded()) {
        this.host.renderError(this.contentEl, error, file.path);
      }
    }
  }

  override async onUnloadFile(_file: TFile): Promise<void> {
    this.loadId += 1;
    this.clearViewer();
    this.contentEl.replaceChildren();
  }

  protected override async onClose(): Promise<void> {
    this.loadId += 1;
    this.clearViewer();
    this.contentEl.replaceChildren();
  }

  private clearViewer(): void {
    this.untrack?.();
    this.untrack = null;
    this.viewer?.destroy();
    this.viewer = null;
  }
}
