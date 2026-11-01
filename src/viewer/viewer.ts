import type { Scene } from "../prg/scene";
import { renderScene } from "../render/renderer";
import { themeForDark, type RenderTheme } from "../render/theme";
import {
  fitCamera,
  panBy,
  resetCamera,
  zoomAt,
  type Camera,
} from "./camera";

export interface ViewerOptions {
  dark?: boolean;
  height?: number;
  fill?: boolean;
  collapsible?: boolean;
}

const COLLAPSED_HEIGHT = 40;

export class PrgViewer {
  readonly root: HTMLDivElement;
  private readonly scene: Scene;
  private readonly stage: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly zoomLabel: HTMLSpanElement;
  private readonly collapseButton: HTMLButtonElement | null = null;
  private readonly fill: boolean;
  private height: number;
  private collapsed = false;
  private theme: RenderTheme;
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private dpr = 1;
  private width = 0;
  private needsFit = true;
  private autoFit = true;
  private frame = 0;
  private destroyed = false;
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, scene: Scene, options: ViewerOptions = {}) {
    this.scene = scene;
    this.fill = options.fill ?? false;
    this.height = this.fill ? 0 : (options.height ?? 520);
    this.theme = themeForDark(options.dark ?? false);

    this.root = container.createEl("div", {
      cls: this.fill ? "prg-viewer prg-viewer--fill" : "prg-viewer",
    });

    this.stage = this.root.createEl("div", { cls: "prg-viewer__stage" });
    this.stage.style.height = this.fill ? "100%" : `${this.height}px`;

    this.canvas = this.stage.createEl("canvas", { cls: "prg-viewer__canvas" });
    this.canvas.tabIndex = 0;

    const actions = this.stage.createEl("div", { cls: "prg-viewer__actions" });
    actions.setAttribute("role", "toolbar");
    actions.setAttribute("aria-label", "预览控制");

    const zoomOut = this.createButton(actions, "−", "缩小");
    const zoomIn = this.createButton(actions, "+", "放大");
    const fit = this.createButton(actions, "适应", "适应窗口");
    this.zoomLabel = actions.createEl("span", { cls: "prg-viewer__zoom", text: "100%" });

    zoomOut.addEventListener("click", () => this.zoom(1 / 1.25));
    zoomIn.addEventListener("click", () => this.zoom(1.25));
    fit.addEventListener("click", () => this.fit());
    this.zoomLabel.addEventListener("click", () => this.reset());

    actions.append(zoomOut, this.zoomLabel, zoomIn, fit);

    if (options.collapsible) {
      this.collapseButton = this.createButton(this.stage, "收起", "收起预览");
      this.collapseButton.classList.add("prg-viewer__collapse");
      this.collapseButton.setAttribute("aria-expanded", "true");
      this.collapseButton.addEventListener("click", () => this.toggleCollapsed());
    }

    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("dblclick", this.onDoubleClick);
    this.canvas.addEventListener("keydown", this.onKeyDown);

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.stage);
    }
    this.resize();
  }

  getCamera(): Camera {
    return { ...this.camera };
  }

  setCamera(camera: Camera): void {
    this.camera = { ...camera };
    this.needsFit = false;
    this.autoFit = false;
    this.schedule();
  }

  fit(): void {
    this.camera = fitCamera(this.scene.bounds, this.width, this.height, 40);
    this.needsFit = false;
    this.autoFit = true;
    this.schedule();
  }

  reset(): void {
    this.camera = resetCamera(this.width, this.height);
    this.autoFit = false;
    this.schedule();
  }

  zoom(factor: number): void {
    this.camera = zoomAt(this.camera, factor, { x: this.width / 2, y: this.height / 2 });
    this.autoFit = false;
    this.schedule();
  }

  setTheme(dark: boolean): void {
    this.theme = themeForDark(dark);
    this.schedule();
  }

  private toggleCollapsed(): void {
    if (!this.collapseButton) {
      return;
    }
    this.collapsed = !this.collapsed;
    if (this.collapsed) {
      this.root.classList.add("prg-viewer--collapsed");
    } else {
      this.root.classList.remove("prg-viewer--collapsed");
    }
    this.stage.style.height = this.collapsed ? `${COLLAPSED_HEIGHT}px` : `${this.height}px`;
    this.canvas.style.display = this.collapsed ? "none" : "";
    this.collapseButton.textContent = this.collapsed ? "展开" : "收起";
    this.collapseButton.setAttribute("aria-label", this.collapsed ? "展开预览" : "收起预览");
    this.collapseButton.setAttribute("aria-expanded", String(!this.collapsed));
    this.autoFit = false;
    if (!this.collapsed) {
      this.resize();
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.frame !== 0) {
      this.cancelFrame(this.frame);
      this.frame = 0;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.canvas.removeEventListener("keydown", this.onKeyDown);
    this.root.remove();
  }

  private createButton(
    parent: HTMLElement,
    label: string,
    ariaLabel: string,
  ): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "prg-viewer__button" });
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel);
    return button;
  }

  private resize(): void {
    if (this.destroyed || this.collapsed) {
      return;
    }
    const previousWidth = this.width;
    const previousHeight = this.height;
    const width = Math.max(1, this.stage.clientWidth);
    const height = this.fill ? Math.max(1, this.stage.clientHeight) : this.height;
    this.width = width;
    this.height = height;
    this.dpr = Math.min(2, this.ownerWindow()?.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    if (this.needsFit || (this.autoFit && (width !== previousWidth || height !== previousHeight))) {
      this.fit();
    } else {
      this.schedule();
    }
  }

  private schedule(): void {
    if (this.destroyed || this.frame !== 0) {
      return;
    }
    this.frame = this.requestFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private requestFrame(callback: FrameRequestCallback): number {
    const win = this.ownerWindow();
    if (win && typeof win.requestAnimationFrame === "function") {
      return win.requestAnimationFrame(callback);
    }
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(callback);
    }
    return 0;
  }

  private cancelFrame(frame: number): void {
    const win = this.ownerWindow();
    if (win && typeof win.cancelAnimationFrame === "function") {
      win.cancelAnimationFrame(frame);
      return;
    }
    if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(frame);
    }
  }

  private draw(): void {
    if (this.destroyed) {
      return;
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    renderScene(ctx, this.scene, this.camera, this.width, this.height, this.theme);
    this.zoomLabel.textContent = `${Math.round(this.camera.scale * 100)}%`;
  }

  private ownerWindow(): Window | null {
    return this.root.ownerDocument.defaultView;
  }

  private localPoint(event: MouseEvent | PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    this.camera = zoomAt(this.camera, factor, this.localPoint(event));
    this.autoFit = false;
    this.schedule();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    this.dragging = true;
    this.dragStart = { x: event.clientX, y: event.clientY };
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add("is-panning");
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) {
      return;
    }
    const dx = event.clientX - this.dragStart.x;
    const dy = event.clientY - this.dragStart.y;
    this.dragStart = { x: event.clientX, y: event.clientY };
    this.camera = panBy(this.camera, dx, dy);
    this.autoFit = false;
    this.schedule();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.canvas.classList.remove("is-panning");
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onDoubleClick = (): void => {
    this.fit();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "=" || event.key === "+") {
      event.preventDefault();
      this.zoom(1.25);
    } else if (event.key === "-") {
      event.preventDefault();
      this.zoom(1 / 1.25);
    } else if (event.key === "0") {
      event.preventDefault();
      this.fit();
    }
  };
}
