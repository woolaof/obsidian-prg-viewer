import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Scene } from "../src/prg/scene";
import { PrgViewer } from "../src/viewer/viewer";

class FakeElement {
  readonly tagName: string;
  readonly ownerDocument: FakeDocument;
  className = "";
  textContent = "";
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  clientWidth = 1000;
  clientHeight = 520;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<() => void>>();
  readonly classList = {
    add: (name: string): void => {
      if (!this.className.split(" ").includes(name)) {
        this.className = `${this.className} ${name}`.trim();
      }
    },
    remove: (name: string): void => {
      this.className = this.className
        .split(" ")
        .filter((part) => part !== name)
        .join(" ");
    },
  };

  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      const index = this.children.indexOf(node);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
      this.children.push(node);
    }
  }

  createEl(tagName: string, options?: { cls?: string; text?: string }): FakeElement {
    const child = new FakeElement(tagName, this.ownerDocument);
    child.className = options?.cls ?? "";
    child.textContent = options?.text ?? "";
    this.children.push(child);
    return child;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((entry) => entry !== listener),
    );
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) {
      listener();
    }
  }

  remove(): void {}

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
  }
}

class FakeDocument {
  readonly defaultView = { devicePixelRatio: 1 };

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

let resizeCallback: (() => void) | null = null;
let observedStage: FakeElement | null = null;

class FakeResizeObserver {
  constructor(callback: () => void) {
    resizeCallback = callback;
  }

  observe(element: FakeElement): void {
    observedStage = element;
  }

  disconnect(): void {}
}

function makeScene(): Scene {
  return {
    texts: [],
    sections: [],
    edges: [],
    multiEdges: [],
    unknown: [],
    bounds: { x: 0, y: 0, width: 1000, height: 1000 },
  } as unknown as Scene;
}

describe("PrgViewer resize", () => {
  beforeEach(() => {
    resizeCallback = null;
    observedStage = null;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refits after the container width settles", () => {
    const document = new FakeDocument();
    const container = document.createElement("div");
    const viewer = new PrgViewer(container as unknown as HTMLElement, makeScene(), { height: 520 });

    expect(viewer.getCamera().scale).toBeCloseTo(0.44, 5);
    expect(observedStage).not.toBeNull();

    observedStage!.clientWidth = 400;
    resizeCallback?.();
    expect(viewer.getCamera().scale).toBeCloseTo(0.32, 5);

    viewer.destroy();
  });

  it("keeps controls inside the canvas stage without a stats bar", () => {
    const document = new FakeDocument();
    const container = document.createElement("div");
    const viewer = new PrgViewer(container as unknown as HTMLElement, makeScene(), { height: 520 });

    const root = viewer.root as unknown as FakeElement;
    const stage = root.children[0] as FakeElement;
    const actions = stage.children.find((child) => child.className.includes("prg-viewer__actions"));

    expect(root.children).toHaveLength(1);
    expect(stage.className).toContain("prg-viewer__stage");
    expect(actions).toBeDefined();
    expect(actions?.children.some((child) => child.textContent.includes("100%"))).toBe(true);
    expect(root.children.some((child) => child.className.includes("prg-viewer__toolbar"))).toBe(false);

    viewer.destroy();
  });

  it("collapses and expands an embedded viewer from the top-left button", () => {
    const document = new FakeDocument();
    const container = document.createElement("div");
    const viewer = new PrgViewer(container as unknown as HTMLElement, makeScene(), {
      height: 520,
      collapsible: true,
    });

    const stage = (viewer.root as unknown as FakeElement).children[0] as FakeElement;
    const button = stage.children.find((child) =>
      child.className.includes("prg-viewer__collapse"),
    ) as FakeElement;

    const scale = viewer.getCamera().scale;
    expect(button.textContent).toBe("收起");
    expect(button.getAttribute("aria-expanded")).toBe("true");

    button.click();
    expect(stage.style.height).toBe("40px");
    expect(button.textContent).toBe("展开");
    expect(button.getAttribute("aria-expanded")).toBe("false");

    button.click();
    expect(stage.style.height).toBe("520px");
    expect(button.textContent).toBe("收起");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(viewer.getCamera().scale).toBeCloseTo(scale, 5);

    viewer.destroy();
  });

  it("does not add the collapse button to a tab viewer", () => {
    const document = new FakeDocument();
    const container = document.createElement("div");
    const viewer = new PrgViewer(container as unknown as HTMLElement, makeScene(), { fill: true });

    const stage = (viewer.root as unknown as FakeElement).children[0] as FakeElement;
    expect(
      stage.children.some((child) => child.className.includes("prg-viewer__collapse")),
    ).toBe(false);

    viewer.destroy();
  });

  it("fills the host element in tab mode", () => {
    const document = new FakeDocument();
    const container = document.createElement("div");
    const viewer = new PrgViewer(container as unknown as HTMLElement, makeScene(), { fill: true });

    expect(viewer.root.className).toContain("prg-viewer--fill");
    expect((viewer.root.children[0] as HTMLElement).style.height).toBe("100%");

    viewer.destroy();
  });

  it("keeps a user zoom when the container is resized, and refits after the fit button", () => {
    const document = new FakeDocument();
    const container = document.createElement("div");
    const viewer = new PrgViewer(container as unknown as HTMLElement, makeScene(), { height: 520 });

    observedStage!.clientWidth = 400;
    resizeCallback?.();
    viewer.zoom(1.25);
    expect(viewer.getCamera().scale).toBeCloseTo(0.4, 5);

    observedStage!.clientWidth = 300;
    resizeCallback?.();
    expect(viewer.getCamera().scale).toBeCloseTo(0.4, 5);

    viewer.fit();
    expect(viewer.getCamera().scale).toBeCloseTo(0.22, 5);

    observedStage!.clientWidth = 600;
    resizeCallback?.();
    expect(viewer.getCamera().scale).toBeCloseTo(0.44, 5);

    viewer.destroy();
  });
});
