import type { Bounds } from "../prg/scene";
import type { Point } from "../render/geometry";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 8;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function worldToScreen(camera: Camera, point: Point): Point {
  return {
    x: point.x * camera.scale + camera.x,
    y: point.y * camera.scale + camera.y,
  };
}

export function screenToWorld(camera: Camera, point: Point): Point {
  return {
    x: (point.x - camera.x) / camera.scale,
    y: (point.y - camera.y) / camera.scale,
  };
}

export function fitCamera(bounds: Bounds | null, width: number, height: number, margin = 48): Camera {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0 || width <= 0 || height <= 0) {
    return { x: width / 2, y: height / 2, scale: 1 };
  }
  const availableWidth = Math.max(1, width - margin * 2);
  const availableHeight = Math.max(1, height - margin * 2);
  const scale = clampScale(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
  );
  return {
    x: width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: height / 2 - (bounds.y + bounds.height / 2) * scale,
    scale,
  };
}

export function zoomAt(camera: Camera, factor: number, anchor: Point): Camera {
  const scale = clampScale(camera.scale * factor);
  const world = screenToWorld(camera, anchor);
  return {
    scale,
    x: anchor.x - world.x * scale,
    y: anchor.y - world.y * scale,
  };
}

export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

export function resetCamera(width: number, height: number): Camera {
  return { x: width / 2, y: height / 2, scale: 1 };
}
