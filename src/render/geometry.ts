import type { Bounds } from "../prg/scene";

export interface Point {
  x: number;
  y: number;
}

export interface ArcGeometry {
  center: Point;
  radius: number;
  startAngle: number;
  sweep: number;
}

const TAU = Math.PI * 2;
const EPSILON = 1e-7;

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function multiply(a: Point, factor: number): Point {
  return { x: a.x * factor, y: a.y * factor };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalize(v: Point): Point {
  const length = Math.hypot(v.x, v.y);
  if (length < EPSILON) {
    return { x: 1, y: 0 };
  }
  return { x: v.x / length, y: v.y / length };
}

export function rotate90(v: Point): Point {
  return { x: -v.y, y: v.x };
}

export function rectCenter(rect: Bounds): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function rectInner(rect: Bounds, rate: { x: number; y: number }): Point {
  return {
    x: rect.x + rect.width * rate.x,
    y: rect.y + rect.height * rate.y,
  };
}

export function rectExpand(rect: Bounds, padding: number): Bounds {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

export function rectArea(rect: Bounds): number {
  return rect.width * rect.height;
}

export function mod(value: number, divisor: number): number {
  const result = value % divisor;
  return result < 0 ? result + divisor : result;
}

/**
 * 求从矩形内部一点出发的射线离开矩形的位置。
 */
export function lineRectBorderIntersection(from: Point, to: Point, rect: Bounds): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const candidates: number[] = [];

  if (Math.abs(dx) > EPSILON) {
    for (const x of [rect.x, rect.x + rect.width]) {
      const t = (x - from.x) / dx;
      if (t > EPSILON) {
        const y = from.y + dy * t;
        if (y >= rect.y - EPSILON && y <= rect.y + rect.height + EPSILON) {
          candidates.push(t);
        }
      }
    }
  }
  if (Math.abs(dy) > EPSILON) {
    for (const y of [rect.y, rect.y + rect.height]) {
      const t = (y - from.y) / dy;
      if (t > EPSILON) {
        const x = from.x + dx * t;
        if (x >= rect.x - EPSILON && x <= rect.x + rect.width + EPSILON) {
          candidates.push(t);
        }
      }
    }
  }

  if (candidates.length === 0) {
    return to;
  }
  const t = Math.min(...candidates);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/**
 * 求线段与轴对齐矩形边界的交点，按从 from 到 to 的顺序返回。
 */
export function segmentRectIntersections(from: Point, to: Point, rect: Bounds): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let t0 = 0;
  let t1 = 1;

  for (const [p, q] of [
    [-dx, from.x - rect.x],
    [dx, rect.x + rect.width - from.x],
    [-dy, from.y - rect.y],
    [dy, rect.y + rect.height - from.y],
  ] as const) {
    if (Math.abs(p) < EPSILON) {
      if (q < 0) {
        return [];
      }
      continue;
    }
    const t = q / p;
    if (p < 0) {
      t0 = Math.max(t0, t);
    } else {
      t1 = Math.min(t1, t);
    }
    if (t0 > t1) {
      return [];
    }
  }

  const points = [
    { x: from.x + dx * t0, y: from.y + dy * t0 },
    { x: from.x + dx * t1, y: from.y + dy * t1 },
  ];
  if (distance(points[0] as Point, points[1] as Point) < 1e-5) {
    return [points[0] as Point];
  }
  return points;
}

function segmentCircleIntersections(
  center: Point,
  radius: number,
  from: Point,
  to: Point,
): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fx = from.x - center.x;
  const fy = from.y - center.y;
  const a = dx * dx + dy * dy;
  if (a < EPSILON) {
    return [];
  }
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return [];
  }
  const root = Math.sqrt(discriminant);
  const result: Point[] = [];
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t >= -EPSILON && t <= 1 + EPSILON) {
      result.push({ x: from.x + dx * t, y: from.y + dy * t });
    }
  }
  return result;
}

export function circleRectIntersections(center: Point, radius: number, rect: Bounds): Point[] {
  const edges: [Point, Point][] = [
    [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
    ],
    [
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ],
    [
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ],
    [
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x, y: rect.y },
    ],
  ];

  const points: Point[] = [];
  for (const [from, to] of edges) {
    for (const point of segmentCircleIntersections(center, radius, from, to)) {
      if (!points.some((existing) => distance(existing, point) < 1e-5)) {
        points.push(point);
      }
    }
  }
  return points;
}

function circleCenter(a: Point, b: Point, c: Point): Point | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < EPSILON) {
    return null;
  }
  const ux =
    ((a.x * a.x + a.y * a.y) * (b.y - c.y) +
      (b.x * b.x + b.y * b.y) * (c.y - a.y) +
      (c.x * c.x + c.y * c.y) * (a.y - b.y)) /
    d;
  const uy =
    ((a.x * a.x + a.y * a.y) * (c.x - b.x) +
      (b.x * b.x + b.y * b.y) * (a.x - c.x) +
      (c.x * c.x + c.y * c.y) * (b.x - a.x)) /
    d;
  return { x: ux, y: uy };
}

/**
 * 求经过 A、B 两点，且经过控制点 C 的圆弧。
 * sweep 为正表示角度递增，为负表示角度递减。
 */
export function arcThroughPoints(a: Point, b: Point, c: Point): ArcGeometry {
  const center = circleCenter(a, b, c);
  if (!center) {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return {
      center: mid,
      radius: distance(a, b) / 2,
      startAngle: Math.atan2(a.y - mid.y, a.x - mid.x),
      sweep: 0,
    };
  }

  const radius = distance(center, a);
  const thetaA = Math.atan2(a.y - center.y, a.x - center.x);
  const thetaB = Math.atan2(b.y - center.y, b.x - center.x);
  const thetaC = Math.atan2(c.y - center.y, c.x - center.x);

  const clockwiseSweep = mod(thetaB - thetaA, TAU);
  const controlPosition = mod(thetaC - thetaA, TAU);
  const sweep = controlPosition <= clockwiseSweep + 1e-6 ? clockwiseSweep : clockwiseSweep - TAU;

  return { center, radius, startAngle: thetaA, sweep };
}

export function angleOnArc(angle: number, geometry: ArcGeometry): boolean {
  const tolerance = 1e-5;
  if (geometry.sweep >= 0) {
    return mod(angle - geometry.startAngle, TAU) <= geometry.sweep + tolerance;
  }
  return mod(geometry.startAngle - angle, TAU) <= -geometry.sweep + tolerance;
}

export function sampleArc(geometry: ArcGeometry, segments = 48): Point[] {
  if (Math.abs(geometry.sweep) < EPSILON) {
    return [
      {
        x: geometry.center.x + geometry.radius * Math.cos(geometry.startAngle),
        y: geometry.center.y + geometry.radius * Math.sin(geometry.startAngle),
      },
    ];
  }
  const count = Math.max(2, segments);
  const points: Point[] = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = geometry.startAngle + (geometry.sweep * index) / count;
    points.push({
      x: geometry.center.x + geometry.radius * Math.cos(angle),
      y: geometry.center.y + geometry.radius * Math.sin(angle),
    });
  }
  return points;
}

export function arcPosition(geometry: ArcGeometry, point: Point): number {
  const angle = Math.atan2(point.y - geometry.center.y, point.x - geometry.center.x);
  const span = Math.abs(geometry.sweep);
  if (span < EPSILON) {
    return 0;
  }
  const delta =
    geometry.sweep >= 0 ? mod(angle - geometry.startAngle, TAU) : mod(geometry.startAngle - angle, TAU);
  return delta / span;
}

export function pointOnArcAt(geometry: ArcGeometry, t: number): Point {
  const angle = geometry.startAngle + geometry.sweep * t;
  return {
    x: geometry.center.x + geometry.radius * Math.cos(angle),
    y: geometry.center.y + geometry.radius * Math.sin(angle),
  };
}

export function clipArcToRect(geometry: ArcGeometry, rect: Bounds, edge: "start" | "end"): Point {
  const intersections = circleRectIntersections(geometry.center, geometry.radius, rect);
  if (intersections.length === 0) {
    return rectCenter(rect);
  }

  const withPosition = intersections.map((point) => {
    const angle = Math.atan2(point.y - geometry.center.y, point.x - geometry.center.x);
    const delta =
      geometry.sweep >= 0 ? mod(angle - geometry.startAngle, TAU) : mod(geometry.startAngle - angle, TAU);
    const span = Math.abs(geometry.sweep);
    return { point, position: span < EPSILON ? 0 : delta / span, onArc: angleOnArc(angle, geometry) };
  });

  const onArc = withPosition.filter((entry) => entry.onArc);
  const candidates = (onArc.length > 0 ? onArc : withPosition).filter((entry) => {
    if (edge === "start") {
      return entry.position >= -1e-6;
    }
    return entry.position <= 1 + 1e-6;
  });
  if (candidates.length === 0) {
    return rectCenter(rect);
  }
  candidates.sort((a, b) => a.position - b.position);
  return (edge === "start" ? candidates[0] : candidates[candidates.length - 1])?.point ?? rectCenter(rect);
}

export interface CubicCurve {
  start: Point;
  ctrl1: Point;
  ctrl2: Point;
  end: Point;
}

export function cubicPoint(curve: CubicCurve, t: number): Point {
  const mt = 1 - t;
  return {
    x:
      curve.start.x * mt ** 3 +
      curve.ctrl1.x * 3 * t * mt ** 2 +
      curve.ctrl2.x * 3 * t ** 2 * mt +
      curve.end.x * t ** 3,
    y:
      curve.start.y * mt ** 3 +
      curve.ctrl1.y * 3 * t * mt ** 2 +
      curve.ctrl2.y * 3 * t ** 2 * mt +
      curve.end.y * t ** 3,
  };
}

/**
 * 2.7-era 导出使用的弯折量：至少 50，斜向长边取较短轴跨度的一半。
 * 参考 SVG 的控制柄长度与此公式一致。
 */
export function lineEdgeBending(start: Point, end: Point): number {
  return Math.max(50, Math.min(Math.abs(start.x - end.x), Math.abs(start.y - end.y)) / 2);
}

export function symmetryCurve(
  start: Point,
  end: Point,
  startDirection: Point,
  endDirection: Point,
  arrowSize = 0,
  bending?: number,
): CubicCurve {
  const delta = subtract(end, start);
  const unit = (direction: Point): Point =>
    direction.x === 0 && direction.y === 0 ? { x: 0, y: 0 } : normalize(direction);
  let resolvedBending = bending ?? Math.hypot(delta.x, delta.y) / 2;
  if (bending === undefined) {
    for (const direction of [unit(startDirection), multiply(unit(endDirection), -1)]) {
      const forwardGap = delta.x * direction.x + delta.y * direction.y;
      if (forwardGap > 0) {
        resolvedBending = Math.min(resolvedBending, forwardGap / 2);
      }
    }
  }
  const adjustedEnd = add(end, multiply(unit(endDirection), arrowSize / 2));
  return {
    start,
    ctrl1: add(start, multiply(unit(startDirection), resolvedBending)),
    ctrl2: add(end, multiply(unit(endDirection), resolvedBending)),
    end: adjustedEnd,
  };
}

export function rectNormal(rect: Bounds, point: Point): Point {
  if (Math.abs(point.x - rect.x) < 1e-4) {
    return { x: -1, y: 0 };
  }
  if (Math.abs(point.x - (rect.x + rect.width)) < 1e-4) {
    return { x: 1, y: 0 };
  }
  if (Math.abs(point.y - rect.y) < 1e-4) {
    return { x: 0, y: -1 };
  }
  return { x: 0, y: 1 };
}

export function convexHull(points: Point[]): Point[] {
  if (points.length <= 2) {
    return points.slice();
  }
  const sorted = points
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (o: Point, a: Point, b: Point): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2) {
      const a = lower[lower.length - 2] as Point;
      const b = lower[lower.length - 1] as Point;
      if (cross(a, b, point) <= 0) {
        lower.pop();
      } else {
        break;
      }
    }
    lower.push(point);
  }

  const upper: Point[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index] as Point;
    while (upper.length >= 2) {
      const a = upper[upper.length - 2] as Point;
      const b = upper[upper.length - 1] as Point;
      if (cross(a, b, point) <= 0) {
        upper.pop();
      } else {
        break;
      }
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
