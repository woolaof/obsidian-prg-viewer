import { describe, expect, it } from "vitest";
import {
  arcPosition,
  arcThroughPoints,
  clipArcToRect,
  convexHull,
  cubicPoint,
  distance,
  lineEdgeBending,
  lineRectBorderIntersection,
  pointOnArcAt,
  segmentRectIntersections,
  symmetryCurve,
} from "../src/render/geometry";
import { fitCamera, screenToWorld, worldToScreen, zoomAt } from "../src/viewer/camera";

describe("geometry", () => {
  it("finds the border exit from an inside point", () => {
    expect(lineRectBorderIntersection({ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 0, y: 0, width: 100, height: 100 })).toEqual({
      x: 100,
      y: 50,
    });
    expect(lineRectBorderIntersection({ x: 50, y: 50 }, { x: 50, y: 150 }, { x: 0, y: 0, width: 100, height: 100 })).toEqual({
      x: 50,
      y: 100,
    });
  });

  it("finds both text-mask intersections", () => {
    const points = segmentRectIntersections(
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      { x: 40, y: 40, width: 20, height: 20 },
    );
    expect(points).toHaveLength(2);
    expect(points[0]?.x).toBeCloseTo(40);
    expect(points[1]?.x).toBeCloseTo(60);
  });

  it("computes a circle through three points", () => {
    const arc = arcThroughPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -50 });
    expect(arc.center.x).toBeCloseTo(50);
    expect(arc.center.y).toBeCloseTo(0);
    expect(arc.radius).toBeCloseTo(50);
    const mid = pointOnArcAt(arc, 0.5);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(-50);
  });

  it("clips an arc to a rectangle", () => {
    const arc = arcThroughPoints({ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 50, y: -50 });
    const start = clipArcToRect(arc, { x: 0, y: 0, width: 100, height: 100 }, "start");
    const end = clipArcToRect(arc, { x: 0, y: 0, width: 100, height: 100 }, "end");
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(50);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(50);
    expect(arcPosition(arc, start)).toBeCloseTo(0);
    expect(arcPosition(arc, end)).toBeCloseTo(1);
  });

  it("builds a convex hull", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ]);
    expect(hull).toHaveLength(4);
  });
});

describe("camera", () => {
  it("fits a bounds into the viewport", () => {
    const camera = fitCamera({ x: 0, y: 0, width: 100, height: 100 }, 300, 200, 0);
    expect(camera.scale).toBe(2);
    expect(camera.x).toBe(50);
    expect(camera.y).toBe(0);
  });

  it("keeps the anchor point fixed while zooming", () => {
    const camera = { x: 10, y: 20, scale: 1 };
    const anchor = { x: 100, y: 100 };
    const before = screenToWorld(camera, anchor);
    const zoomed = zoomAt(camera, 2, anchor);
    const after = screenToWorld(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(worldToScreen(zoomed, before)).toEqual(anchor);
  });
});

describe("curve regression", () => {
  it("reproduces the reference bending and shifts the curve end for the arrow", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 1000, y: 0 };
    const bending = lineEdgeBending(start, end);
    expect(bending).toBe(50);
    const curve = symmetryCurve(start, end, { x: 1, y: 0 }, { x: -1, y: 0 }, 16, bending);
    expect(curve.ctrl1.x).toBeCloseTo(50);
    expect(curve.ctrl2.x).toBeCloseTo(1000 - 50);
    expect(curve.end.x).toBeCloseTo(992);
    expect(cubicPoint(curve, 0).x).toBeCloseTo(0);
    expect(cubicPoint(curve, 1).x).toBeCloseTo(992);
  });

  it("keeps a zero direction at the endpoint for ConnectPoint edges", () => {
    const curve = symmetryCurve(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      16,
      50,
    );
    expect(curve.ctrl1).toEqual({ x: 0, y: 0 });
    expect(curve.ctrl2).toEqual({ x: 100, y: 0 });
  });

  it("uses the shorter axis span for diagonal reference curves", () => {
    expect(lineEdgeBending({ x: 0, y: 0 }, { x: 1000, y: 400 })).toBe(200);
    expect(lineEdgeBending({ x: 0, y: 0 }, { x: 80, y: 400 })).toBe(50);
  });

  it("scales the minimum bending with a wider edge", () => {
    expect(lineEdgeBending({ x: 0, y: 0 }, { x: 1000, y: 400 }, 16)).toBe(400);
  });

  it("clips an almost straight arc to the near end, not the opposite side", () => {
    const arc = arcThroughPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0.5 });
    const start = clipArcToRect(arc, { x: -5, y: -5, width: 10, height: 10 }, "start");
    const end = clipArcToRect(arc, { x: 95, y: -5, width: 10, height: 10 }, "end");
    expect(distance(start, { x: 0, y: 0 })).toBeLessThan(10);
    expect(distance(end, { x: 100, y: 0 })).toBeLessThan(10);
    expect(arcPosition(arc, start)).toBeLessThanOrEqual(1.000001);
    expect(arcPosition(arc, end)).toBeLessThanOrEqual(1.000001);
  });
});
