import {
  addIcon,
  MarkdownRenderChild,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  type Editor,
  type MarkdownPostProcessorContext,
  type Menu,
  type TAbstractFile,
} from "obsidian";
import { PrgParseError } from "./src/prg/errors";
import { parsePrg } from "./src/prg/parser";
import type { Scene } from "./src/prg/scene";
import { PRG_VIEW_TYPE, PrgFileView, type PrgFileViewHost } from "./src/plugin/file-view";
import { insertPrgCodeBlock, relativeVaultPath } from "./src/plugin/insert";
import { PrgFilePicker } from "./src/plugin/picker";
import { parsePrgSource, PrgSourceError, resolveRelativeVaultPath } from "./src/plugin/source";
import { PrgViewer } from "./src/viewer/viewer";

const VIEWER_HEIGHT = 560;
const PRG_RIBBON_ICON = "prg-viewer-ribbon";
const PRG_RIBBON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><path d="M10 6.5h4a3 3 0 0 1 3 3v4"/><path d="M14 17.5h-4a3 3 0 0 1-3-3v-4"/></svg>`;

class PrgViewerChild extends MarkdownRenderChild {
  private readonly viewer: PrgViewer;
  private readonly dispose: () => void;

  constructor(containerEl: HTMLElement, viewer: PrgViewer, dispose: () => void) {
    super(containerEl);
    this.viewer = viewer;
    this.dispose = dispose;
  }

  override onunload(): void {
    this.dispose();
    this.viewer.destroy();
  }
}

export default class PrgViewerPlugin extends Plugin implements PrgFileViewHost {
  private readonly viewers = new Set<PrgViewer>();
  private unloaded = false;

  override onload(): void {
    this.unloaded = false;
    this.registerView(
      PRG_VIEW_TYPE,
      (leaf) => new PrgFileView(leaf, this),
    );
    this.registerExtensions(["prg"], PRG_VIEW_TYPE);

    addIcon(PRG_RIBBON_ICON, PRG_RIBBON_SVG);
    this.addRibbonIcon(PRG_RIBBON_ICON, "PRG 预览", () => {
      this.openPicker();
    });
    this.addRibbonIcon("plus", "插入 PRG 预览", () => {
      this.insertPreviewFromActiveNote();
    });
    this.addCommand({
      id: "open-preview",
      name: "打开 PRG 预览",
      callback: () => {
        this.openPicker();
      },
    });
    this.addCommand({
      id: "insert-preview",
      name: "插入 PRG 预览",
      editorCallback: (editor, ctx) => {
        const sourceFile = ctx.file;
        if (!sourceFile) {
          new Notice("请先打开一个 Markdown 笔记");
          return;
        }
        new PrgFilePicker(this.app, (file) => {
          this.insertPreview(editor, sourceFile, file);
        }).open();
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === "prg") {
          this.addFileMenuItem(menu, file);
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        const dark = document.body.classList.contains("theme-dark");
        for (const viewer of this.viewers) {
          viewer.setTheme(dark);
        }
      }),
    );

    this.registerMarkdownCodeBlockProcessor("prg-viewer", (source, el, ctx) => {
      void this.renderBlock(source, el, ctx);
    });
  }

  override onunload(): void {
    this.unloaded = true;
    for (const viewer of this.viewers) {
      viewer.destroy();
    }
    this.viewers.clear();
  }

  private async renderBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): Promise<void> {
    if (this.unloaded) {
      return;
    }
    el.replaceChildren();

    let rawPath: string;
    try {
      rawPath = parsePrgSource(source);
    } catch (error) {
      this.renderError(el, error);
      return;
    }

    const file = this.resolveFile(rawPath, ctx.sourcePath);
    if (!file) {
      this.renderError(
        el,
        new Error(`找不到文件：${rawPath}（相对于 ${ctx.sourcePath || "库根目录"}）`),
      );
      return;
    }

    let scene: Scene;
    try {
      scene = await this.readScene(file);
    } catch (error) {
      if (!this.unloaded) {
        this.renderError(el, error, file.path);
      }
      return;
    }

    if (this.unloaded) {
      return;
    }

    const viewer = new PrgViewer(el, scene, {
      dark: document.body.classList.contains("theme-dark"),
      height: VIEWER_HEIGHT,
      collapsible: true,
    });
    this.viewers.add(viewer);
    ctx.addChild(
      new PrgViewerChild(el, viewer, () => {
        this.viewers.delete(viewer);
      }),
    );
  }

  async readScene(file: TFile): Promise<Scene> {
    const data = new Uint8Array(await this.app.vault.readBinary(file));
    return parsePrg(data);
  }

  trackViewer(viewer: PrgViewer): () => void {
    this.viewers.add(viewer);
    return () => {
      this.viewers.delete(viewer);
    };
  }

  isUnloaded(): boolean {
    return this.unloaded;
  }

  private addFileMenuItem(menu: Menu, file: TFile): void {
    menu.addItem((item) => {
      item
        .setTitle("用 PRG Viewer 打开")
        .setIcon("image")
        .onClick(() => {
          void this.openPrgFile(file);
        });
    });
  }

  private openPicker(): void {
    new PrgFilePicker(this.app, (file) => {
      void this.openPrgFile(file);
    }).open();
  }

  private insertPreviewFromActiveNote(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const sourceFile = view?.file;
    if (!view || !sourceFile) {
      new Notice("请先打开一个 Markdown 笔记");
      return;
    }
    new PrgFilePicker(this.app, (file) => {
      this.insertPreview(view.editor, sourceFile, file);
    }).open();
  }

  private insertPreview(editor: Editor, sourceFile: TFile, targetFile: TFile): void {
    const path = relativeVaultPath(targetFile.path, sourceFile.path);
    insertPrgCodeBlock(editor, path);
    new Notice(`已插入 PRG 预览：${targetFile.basename}`);
  }

  private async openPrgFile(file: TFile): Promise<void> {
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  private resolveFile(rawPath: string, sourcePath: string): TFile | null {
    const linked = this.app.metadataCache.getFirstLinkpathDest(rawPath, sourcePath);
    if (linked instanceof TFile) {
      return linked;
    }
    try {
      const vaultPath = resolveRelativeVaultPath(rawPath, sourcePath);
      const candidate = this.app.vault.getAbstractFileByPath(vaultPath);
      return candidate instanceof TFile ? candidate : null;
    } catch {
      return null;
    }
  }

  renderError(el: HTMLElement, error: unknown, filePath?: string): void {
    const message =
      error instanceof PrgSourceError
        ? error.message
        : error instanceof PrgParseError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
    const box = el.createEl("div", { cls: "prg-viewer__error" });
    box.createEl("strong", { text: "无法打开 PRG 文件" });
    box.createEl("p", { text: message });
    if (filePath) {
      box.createEl("code", { text: filePath });
    }
  }
}
