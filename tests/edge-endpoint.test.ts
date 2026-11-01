import { describe, expect, it } from "vitest";
import type { SceneObject } from "../src/prg/scene";
import { edgeEndpoint, exactEdgePosition } from "../src/render/edge-endpoint";

function geometry(kind: SceneObject["kind"], x: number, y: number) {
  const rect = { x, y, width: 100, height: 100 };
  return {
    object: { kind } as SceneObject,
    rect,
    center: { x: x + 50, y: y + 50 },
  };
}

describe("edge endpoints", () => {
  it("clips a target toward the source instead of collapsing to its center", () => {
    const target = geometry("TextNode", 0, 0);
    const end = edgeEndpoint(target, { x: 50, y: -200 }, { x: 0.5, y: 0.5 });
    expect(end).toEqual({ x: 50, y: 0 });
  });

  it("clips a source toward the target", () => {
    const source = geometry("TextNode", 0, 0);
    const start = edgeEndpoint(source, { x: 50, y: 200 }, { x: 0.5, y: 0.5 });
    expect(start).toEqual({ x: 50, y: 100 });
  });

  it("uses exact side centers for 0.01 and 0.99 rates", () => {
    const rect = { x: 10, y: 20, width: 100, height: 60 };
    expect(exactEdgePosition(rect, { x: 0.01, y: 0.5 })).toEqual({ x: 10, y: 50 });
    expect(exactEdgePosition(rect, { x: 0.99, y: 0.5 })).toEqual({ x: 110, y: 50 });
    expect(exactEdgePosition(rect, { x: 0.5, y: 0.01 })).toEqual({ x: 60, y: 20 });
    expect(exactEdgePosition(rect, { x: 0.5, y: 0.99 })).toEqual({ x: 60, y: 80 });
    expect(exactEdgePosition(rect, { x: 0.5, y: 0.5 })).toBeNull();
  });

  it("returns the ConnectPoint center", () => {
    const point = geometry("ConnectPoint", 200, 200);
    expect(edgeEndpoint(point, { x: 0, y: 0 }, { x: 0.5, y: 0.5 })).toEqual({ x: 250, y: 250 });
  });
});
