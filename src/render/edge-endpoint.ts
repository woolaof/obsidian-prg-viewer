import type { Bounds, SceneObject } from "../prg/scene";
import { lineRectBorderIntersection, rectInner, type Point } from "./geometry";

export interface EdgeObjectGeometry {
  object: SceneObject;
  rect: Bounds;
  center: Point;
}

export function exactEdgePosition(rect: Bounds, rate: { x: number; y: number }): Point | null {
  if (rate.x === 0.01) {
    return { x: rect.x, y: rect.y + rect.height / 2 };
  }
  if (rate.x === 0.99) {
    return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  }
  if (rate.y === 0.01) {
    return { x: rect.x + rect.width / 2, y: rect.y };
  }
  if (rate.y === 0.99) {
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  }
  return null;
}

/**
 * 从对象内部的 rate 点向另一个对象的中心连线，取与对象边框的交点。
 * 目标端点也必须朝源对象方向裁剪；用目标自己的中心会得到零向量并退回中心点。
 */
export function edgeEndpoint(
  object: EdgeObjectGeometry,
  otherCenter: Point,
  rate: { x: number; y: number },
): Point {
  if (object.object.kind === "ConnectPoint") {
    return object.center;
  }
  const exact = exactEdgePosition(object.rect, rate);
  if (exact) {
    return exact;
  }
  const inner = rectInner(object.rect, rate);
  return lineRectBorderIntersection(inner, otherCenter, object.rect);
}
