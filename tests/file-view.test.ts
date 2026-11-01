import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  viewers: [] as Array<{ el: unknown; scene: unknown; options: unknown }>,
  destroyed: 0,
  untracked: 0,
}));

vi.mock("obsidian", () => {
  class FileView {
    contentEl: Record<string, unknown>;
    file: unknown = null;
    navigation = true;
    allowNoFile = true;

    constructor() {
      this.contentEl = {
        classList: { add: vi.fn() },
        replaceChildren: vi.fn(),
        append: vi.fn(),
      };
    }
  }
  return { FileView };
});

vi.mock("../src/viewer/viewer", () => ({
  PrgViewer: class {
    constructor(el: unknown, scene: unknown, options: unknown) {
      mocks.viewers.push({ el, scene, options });
    }
    destroy(): void {
      mocks.destroyed += 1;
    }
  },
}));

import { PrgFileView, type PrgFileViewHost } from "../src/plugin/file-view";

function makeHost(): PrgFileViewHost & { errors: unknown[] } {
  const errors: unknown[] = [];
  return {
    errors,
    readScene: vi.fn(async () => ({ texts: [], sections: [], edges: [], multiEdges: [], unknown: [] })) as never,
    renderError: vi.fn((_el: HTMLElement, error: unknown) => {
      errors.push(error);
    }),
    trackViewer: vi.fn(() => () => {
      mocks.untracked += 1;
    }),
    isUnloaded: vi.fn(() => false),
  } as never;
}

describe("PRG file view", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      body: { classList: { contains: () => true } },
    });
    mocks.viewers.length = 0;
    mocks.destroyed = 0;
    mocks.untracked = 0;
  });

  it("loads a PRG file into a full-tab viewer", async () => {
    const host = makeHost();
    const view = new PrgFileView({} as never, host);

    await view.onLoadFile({ path: "学习/图.prg", basename: "图" } as never);

    expect(host.readScene).toHaveBeenCalledOnce();
    expect(mocks.viewers).toHaveLength(1);
    expect(mocks.viewers[0]?.options).toMatchObject({ fill: true, dark: true });
    expect(view.navigation).toBe(true);
    expect(host.trackViewer).toHaveBeenCalledOnce();
  });

  it("destroys the old viewer when the file is unloaded", async () => {
    const host = makeHost();
    const view = new PrgFileView({} as never, host);
    await view.onLoadFile({ path: "图.prg", basename: "图" } as never);

    await view.onUnloadFile({ path: "图.prg", basename: "图" } as never);

    expect(mocks.destroyed).toBe(1);
    expect(mocks.untracked).toBe(1);
  });

  it("shows the host error box when parsing fails", async () => {
    const host = makeHost();
    (host.readScene as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("坏文件"));
    const view = new PrgFileView({} as never, host);

    await view.onLoadFile({ path: "坏.prg", basename: "坏" } as never);

    expect(host.errors).toHaveLength(1);
    expect(mocks.viewers).toHaveLength(0);
  });
});
