import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processor: null as null | ((source: string, el: unknown, ctx: unknown) => void),
  parsePrg: vi.fn(),
  viewers: [] as Array<{ el: unknown; scene: unknown; options: unknown }>,
  files: new Map<string, unknown>(),
  readBinary: vi.fn(),
  TFile: null as null | (new (path: string) => { path: string }),
  themeCalls: [] as boolean[],
  destroyed: 0,
  cssHandler: null as null | (() => void),
  viewType: null as string | null,
  extensions: [] as string[],
  commands: [] as string[],
  ribbonTitles: [] as string[],
}));

vi.mock("obsidian", () => {
  class TFile {
    path: string;
    extension: string;
    basename: string;
    constructor(path: string) {
      this.path = path;
      const name = path.split("/").pop() ?? path;
      const dot = name.lastIndexOf(".");
      this.extension = dot >= 0 ? name.slice(dot + 1) : "";
      this.basename = dot >= 0 ? name.slice(0, dot) : name;
    }
  }
  class Plugin {
    app: unknown;
    constructor(app: unknown) {
      this.app = app;
    }
    registerMarkdownCodeBlockProcessor(_language: string, processor: typeof mocks.processor): void {
      mocks.processor = processor;
    }
    registerEvent(): void {}
    registerView(type: string): void {
      mocks.viewType = type;
    }
    registerExtensions(extensions: string[]): void {
      mocks.extensions = extensions;
    }
    addRibbonIcon(_icon: string, title: string): void {
      mocks.ribbonTitles.push(title);
    }
    addCommand(command: { id: string }): void {
      mocks.commands.push(command.id);
    }
  }
  class MarkdownRenderChild {
    containerEl: unknown;
    constructor(containerEl: unknown) {
      this.containerEl = containerEl;
    }
    onunload(): void {}
  }
  class FileView {
    contentEl: Record<string, unknown>;
    file: unknown = null;
    navigation = true;
    allowNoFile = true;
    constructor() {
      this.contentEl = {
        classList: { add(): void {} },
        replaceChildren(): void {},
        append(): void {},
      };
    }
  }
  class FuzzySuggestModal {
    constructor(_app: unknown) {}
    setPlaceholder(): void {}
    open(): void {}
  }
  mocks.TFile = TFile;
  return { Plugin, MarkdownRenderChild, FileView, FuzzySuggestModal, TFile, addIcon: vi.fn() };
});

vi.mock("../src/viewer/viewer", () => ({
  PrgViewer: class {
    constructor(el: unknown, scene: unknown, options: unknown) {
      mocks.viewers.push({ el, scene, options });
    }
    destroy(): void {
      mocks.destroyed += 1;
    }
    setTheme(dark: boolean): void {
      mocks.themeCalls.push(dark);
    }
  },
}));

vi.mock("../src/prg/parser", () => ({ parsePrg: mocks.parsePrg }));

import PrgViewerPlugin from "../main.ts";

function makeElement() {
  const children: Array<{ tag: string; text: string; className: string }> = [];
  const el: {
    children: typeof children;
    replaceChildren(): void;
    append(...nodes: Array<{ tagName?: string; textContent?: string; className?: string }>): void;
    createEl(
      tagName: string,
      options?: { cls?: string; text?: string },
    ): {
      tagName: string;
      textContent: string;
      className: string;
      createEl: (childTag: string, childOptions?: { cls?: string; text?: string }) => unknown;
    };
  } = {
    children,
    replaceChildren(): void {
      children.length = 0;
    },
    append(...nodes): void {
      for (const node of nodes) {
        children.push({
          tag: node.tagName?.toLowerCase() ?? "text",
          text: node.textContent ?? "",
          className: node.className ?? "",
        });
      }
    },
    createEl(tagName, options) {
      const makeChild = (
        childTag: string,
        childOptions?: { cls?: string; text?: string },
      ): {
        tagName: string;
        textContent: string;
        className: string;
        createEl: (nestedTag: string, nestedOptions?: { cls?: string; text?: string }) => unknown;
      } => ({
        tagName: childTag,
        textContent: childOptions?.text ?? "",
        className: childOptions?.cls ?? "",
        createEl: makeChild,
      });
      const child = makeChild(tagName, options);
      children.push({ tag: tagName.toLowerCase(), text: child.textContent, className: child.className });
      return child;
    },
  };
  return el;
}

function makeApp() {
  return {
    metadataCache: {
      getFirstLinkpathDest: vi.fn((path: string) => mocks.files.get(path) ?? null),
    },
    vault: {
      readBinary: mocks.readBinary,
      getAbstractFileByPath: vi.fn((path: string) => mocks.files.get(path) ?? null),
    },
    workspace: {
      on: vi.fn((_event: string, handler: () => void) => {
        mocks.cssHandler = handler;
        return {};
      }),
    },
  };
}

describe("Obsidian code block", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      body: { classList: { contains: () => false } },
      createElement: (tagName: string) => ({ tagName, textContent: "", className: "", append() {} }),
    });
    mocks.processor = null;
    mocks.viewers.length = 0;
    mocks.files.clear();
    mocks.readBinary.mockReset();
    mocks.parsePrg.mockReset();
    mocks.themeCalls.length = 0;
    mocks.destroyed = 0;
    mocks.cssHandler = null;
    mocks.viewType = null;
    mocks.extensions.length = 0;
    mocks.commands.length = 0;
    mocks.ribbonTitles.length = 0;
    mocks.parsePrg.mockReturnValue({
      texts: [],
      sections: [],
      edges: [],
      multiEdges: [],
      unknown: [],
    });
  });

  it("registers the .prg file view, ribbon action, and command", () => {
    const app = makeApp();
    const plugin = new PrgViewerPlugin(app as never, {} as never);
    plugin.onload();

    expect(mocks.viewType).toBe("prg-viewer-file");
    expect(mocks.extensions).toEqual(["prg"]);
    expect(mocks.commands).toContain("open-preview");
    expect(mocks.commands).toContain("insert-preview");
    expect(mocks.ribbonTitles).toContain("PRG 预览");
  });

  it("resolves a relative path, reads it, and mounts a viewer", async () => {
    const app = makeApp();
    const plugin = new PrgViewerPlugin(app as never, {} as never);
    plugin.onload();

    const file = new mocks.TFile!("学习/图.prg");
    mocks.files.set("图.prg", file);
    mocks.readBinary.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const el = makeElement();
    const addChild = vi.fn();

    mocks.processor?.("图.prg", el, { sourcePath: "学习/笔记.md", addChild });
    await vi.waitFor(() => expect(mocks.viewers).toHaveLength(1));

    expect(mocks.readBinary).toHaveBeenCalledWith(file);
    expect(mocks.parsePrg).toHaveBeenCalled();
    expect(mocks.viewers[0]?.options).toMatchObject({ height: 560, collapsible: true });
    expect(addChild).toHaveBeenCalledOnce();
    expect(el.children).toHaveLength(0);

    mocks.cssHandler?.();
    expect(mocks.themeCalls).toEqual([false]);
  });

  it("mounts multiple viewers and destroys them when the plugin unloads", async () => {
    const app = makeApp();
    const plugin = new PrgViewerPlugin(app as never, {} as never);
    plugin.onload();
    mocks.readBinary.mockResolvedValue(new Uint8Array([1, 2, 3]));
    for (const name of ["一.prg", "二.prg"]) {
      mocks.files.set(name, new mocks.TFile!(name));
      mocks.processor?.(name, makeElement(), { sourcePath: "笔记.md", addChild: vi.fn() });
    }
    await vi.waitFor(() => expect(mocks.viewers).toHaveLength(2));

    plugin.onunload();
    expect(mocks.destroyed).toBe(2);
  });

  it("does not mount a viewer when the plugin unloads during a read", async () => {
    const app = makeApp();
    const plugin = new PrgViewerPlugin(app as never, {} as never);
    plugin.onload();
    const file = new mocks.TFile!("慢.prg");
    mocks.files.set("慢.prg", file);
    let resolveRead!: (value: Uint8Array) => void;
    mocks.readBinary.mockReturnValue(
      new Promise<Uint8Array>((resolve) => {
        resolveRead = resolve;
      }),
    );
    const el = makeElement();

    mocks.processor?.("慢.prg", el, { sourcePath: "笔记.md", addChild: vi.fn() });
    expect(mocks.readBinary).toHaveBeenCalledOnce();
    plugin.onunload();
    resolveRead(new Uint8Array([1, 2, 3]));
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.viewers).toHaveLength(0);
    expect(el.children).toHaveLength(0);
  });

  it("shows an inline error when the file is missing", async () => {
    const app = makeApp();
    const plugin = new PrgViewerPlugin(app as never, {} as never);
    plugin.onload();
    const el = makeElement();

    mocks.processor?.("不存在.prg", el, { sourcePath: "笔记.md", addChild: vi.fn() });
    await vi.waitFor(() => expect(el.children.length).toBeGreaterThan(0));

    const error = el.children.find((child) => child.className === "prg-viewer__error");
    expect(error).toBeDefined();
    expect(mocks.readBinary).not.toHaveBeenCalled();
  });

  it("rejects a URL source before reading the vault", async () => {
    const app = makeApp();
    const plugin = new PrgViewerPlugin(app as never, {} as never);
    plugin.onload();
    const el = makeElement();

    mocks.processor?.("https://example.com/a.prg", el, { sourcePath: "笔记.md", addChild: vi.fn() });
    await vi.waitFor(() => expect(el.children.length).toBeGreaterThan(0));

    expect(el.children[0]?.className).toBe("prg-viewer__error");
    expect(mocks.readBinary).not.toHaveBeenCalled();
  });

  it("shows an inline error, not a throw, when parsing fails", async () => {
    const app = makeApp();
    const plugin = new PrgViewerPlugin(app as never, {} as never);
    plugin.onload();
    const file = new mocks.TFile!("图.prg");
    mocks.files.set("图.prg", file);
    mocks.readBinary.mockResolvedValue(new Uint8Array([1]));
    mocks.parsePrg.mockImplementation(() => {
      throw new Error("坏文件");
    });
    const el = makeElement();

    mocks.processor?.("图.prg", el, { sourcePath: "笔记.md", addChild: vi.fn() });
    await vi.waitFor(() => expect(el.children.length).toBeGreaterThan(0));

    expect(mocks.viewers).toHaveLength(0);
    expect(el.children.some((child) => child.className === "prg-viewer__error")).toBe(true);
  });
});
