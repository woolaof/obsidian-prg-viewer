import type {
  Bounds,
  Rgba,
  Scene,
  SceneArcEdge,
  SceneConnectPoint,
  SceneEdge,
  SceneLineEdge,
  SceneMultiEdge,
  SceneObject,
  SceneSection,
  SceneTextNode,
} from "../prg/scene";
import type { Camera } from "../viewer/camera";
import { screenToWorld, worldToScreen } from "../viewer/camera";
import {
  add,
  arcThroughPoints,
  clipArcToRect,
  arcPosition,
  convexHull,
  cubicPoint,
  distance,
  lineRectBorderIntersection,
  multiply,
  normalize,
  pointOnArcAt,
  rectArea,
  rectCenter,
  rectExpand,
  rectInner,
  rectNormal,
  segmentRectIntersections,
  subtract,
  lineEdgeBending,
  symmetryCurve,
  type CubicCurve,
  type Point,
} from "./geometry";
import { edgeEndpoint } from "./edge-endpoint";
import type { RenderTheme } from "./theme";

export const FONT_SIZE = 32;
export const NODE_PADDING = 14;
export const NODE_RADIUS = 8;
const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
// Project Graph 4.2.3: 默认 titleOnly 分节填充、大标题阈值 0.45、正文小于 5px 隐藏
const TEXT_VISIBLE_FONT_SIZE = 5;
const EDGE_LABEL_STROKE_RATIO = 0.4;
const BIG_TITLE_THRESHOLD_RATIO = 0.15;
const BIG_TITLE_SCALE_THRESHOLD = 0.45;
const BIG_TITLE_ALPHA = 0.5;
const BIG_TITLE_MIN_VIEW_SIZE = 20;
const SECTION_TITLE_BAR_WORLD_HEIGHT = FONT_SIZE + NODE_PADDING * 2;

interface TextLine {
  text: string;
  width: number;
}

interface ObjectRect {
  object: SceneObject;
  rect: Bounds;
  center: Point;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  camera: Camera,
  width: number,
  height: number,
  theme: RenderTheme,
): void {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  const viewTopLeft = screenToWorld(camera, { x: 0, y: 0 });
  const viewWorld = {
    x: viewTopLeft.x,
    y: viewTopLeft.y,
    width: width / camera.scale,
    height: height / camera.scale,
  };
  const sections = scene.sections
    .filter((section) => section.bounds !== null)
    .slice()
    .sort((a, b) => (a.bounds as Bounds).y - (b.bounds as Bounds).y);

  for (const section of sections) {
    drawSectionBackground(ctx, section, camera, theme);
  }
  for (const node of scene.texts) {
    drawTextNode(ctx, node, camera, theme);
  }
  for (const section of sections) {
    drawSectionBorderAndTitle(ctx, section, camera, theme, viewWorld);
  }
  for (const point of scene.connectPoints) {
    drawConnectPoint(ctx, point, camera, theme);
  }
  for (const edge of scene.edges) {
    drawEdge(ctx, scene, edge, camera, theme);
  }
  for (const edge of scene.multiEdges) {
    drawMultiEdge(ctx, scene, edge, camera, theme);
  }
  // Project Graph 4.2.3 按从上到下的顺序收集分节，大标题反向绘制。
  // 大标题的底色和文字分两轮画，避免后画的底色盖住先画的标题文字。
  const bigTitles: { section: SceneSection; layout: BigTitleLayout }[] = [];
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    const section = sections[index] as SceneSection;
    if (hasActiveBigTitleAncestor(section, scene, camera, viewWorld)) {
      continue;
    }
    const layout = layoutSectionBigTitle(ctx, section, camera, viewWorld, width, height);
    if (layout) {
      bigTitles.push({ section, layout });
    }
  }
  for (const { section, layout } of bigTitles) {
    fillSectionBigTitle(ctx, section, layout, theme);
  }
  for (const { section, layout } of bigTitles) {
    drawSectionBigTitleText(ctx, section, layout, theme);
  }

  ctx.restore();
}

function rgba(color: Rgba, alpha = color.a): string {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    const value = Number.parseInt(hex.slice(1), 16);
    return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
  }
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = hex.slice(1).split("");
    const expand = (part: string): number => Number.parseInt(part + part, 16);
    return `rgba(${expand(r as string)}, ${expand(g as string)}, ${expand(b as string)}, ${alpha})`;
  }
  return color;
}

function inverted(color: Rgba): string {
  return `rgb(${Math.round(255 - color.r)}, ${Math.round(255 - color.g)}, ${Math.round(255 - color.b)})`;
}

function invertHex(color: string): string | null {
  const hex = color.trim();
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    return null;
  }
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${255 - ((value >> 16) & 0xff)}, ${255 - ((value >> 8) & 0xff)}, ${255 - (value & 0xff)})`;
}

function textColorForFill(color: Rgba, theme: RenderTheme): string {
  return color.a === 1 ? inverted(color) : (invertHex(theme.background) ?? theme.text);
}

function screenRect(bounds: Bounds, camera: Camera): Bounds {
  const topLeft = worldToScreen(camera, { x: bounds.x, y: bounds.y });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bounds.width * camera.scale,
    height: bounds.height * camera.scale,
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  const safeRadius = Math.max(0, Math.min(radius, safeWidth / 2, safeHeight / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + safeWidth - safeRadius, y);
  ctx.arcTo(x + safeWidth, y, x + safeWidth, y + safeRadius, safeRadius);
  ctx.lineTo(x + safeWidth, y + safeHeight - safeRadius);
  ctx.arcTo(x + safeWidth, y + safeHeight, x + safeWidth - safeRadius, y + safeHeight, safeRadius);
  ctx.lineTo(x + safeRadius, y + safeHeight);
  ctx.arcTo(x, y + safeHeight, x, y + safeHeight - safeRadius, safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.arcTo(x, y, x + safeRadius, y, safeRadius);
  ctx.closePath();
}

function setFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  family = "",
  weight = "",
): void {
  const safeSize = Math.max(1, size);
  ctx.font = `${weight || "normal"} ${safeSize}px ${family || FONT_FAMILY}`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split("\n");
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    return paragraphs;
  }

  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const characters = Array.from(paragraph);
    if (characters.length === 0) {
      lines.push("");
      continue;
    }

    let start = 0;
    while (start < characters.length) {
      const remaining = characters.slice(start);
      if (ctx.measureText(remaining.join("")).width <= maxWidth) {
        lines.push(remaining.join(""));
        break;
      }

      let low = 1;
      let high = remaining.length;
      let fitting = 0;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const width = ctx.measureText(remaining.slice(0, middle).join("")).width;
        if (width <= maxWidth) {
          fitting = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      if (fitting === 0) {
        fitting = 1;
      }
      lines.push(remaining.slice(0, fitting).join(""));
      start += fitting;
    }
  }
  return lines;
}

function measureLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
): TextLine[] {
  return lines.map((line) => ({ text: line, width: ctx.measureText(line).width }));
}

function drawTextLines(
  ctx: CanvasRenderingContext2D,
  lines: TextLine[],
  centerX: number,
  firstCenterY: number,
  fontSize: number,
  lineHeight: number,
  color: string,
  align: CanvasTextAlign = "center",
): void {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as TextLine;
    const y = firstCenterY + index * fontSize * lineHeight;
    ctx.fillText(line.text, centerX, y);
  }
}

function drawEdgeLabel(
  ctx: CanvasRenderingContext2D,
  lines: TextLine[],
  center: Point,
  fontSize: number,
  color: string,
  background: string,
): void {
  if (lines.length === 0 || fontSize <= 0) {
    return;
  }

  // 4.2.3 的边文字用背景色描边，宽度是字号的 0.4。
  // 深色主题下短标签（+、-）的描边会连成黑色方块，外观接近底色块，但不是矩形填充。
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = background;
  ctx.lineWidth = fontSize * EDGE_LABEL_STROKE_RATIO;
  ctx.fillStyle = color;
  const firstCenterY = center.y - ((lines.length - 1) * fontSize * 1.2) / 2;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as TextLine;
    const y = firstCenterY + index * fontSize * 1.2;
    ctx.strokeText(line.text, center.x, y);
    ctx.fillText(line.text, center.x, y);
  }
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  curve: CubicCurve,
  camera: Camera,
  color: string,
  width: number,
  dashed: boolean,
): void {
  const start = worldToScreen(camera, curve.start);
  const ctrl1 = worldToScreen(camera, curve.ctrl1);
  const ctrl2 = worldToScreen(camera, curve.ctrl2);
  const end = worldToScreen(camera, curve.end);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.bezierCurveTo(ctrl1.x, ctrl1.y, ctrl2.x, ctrl2.y, end.x, end.y);
  if (dashed) {
    ctx.setLineDash([8 * width, 8 * width]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawTextNode(
  ctx: CanvasRenderingContext2D,
  node: SceneTextNode,
  camera: Camera,
  theme: RenderTheme,
): void {
  if (!node.bounds) {
    return;
  }
  const rect = screenRect(node.bounds, camera);
  const fontSizeWorld = 32 * 2 ** (node.fontScaleLevel / 2);
  const paddingWorld = (fontSizeWorld / 32) * NODE_PADDING;
  const radius = (fontSizeWorld / FONT_SIZE) * NODE_RADIUS * camera.scale;
  const borderWidth = Math.max(0.01, (fontSizeWorld / 32) * 2 * camera.scale);
  const fontSize = fontSizeWorld * camera.scale;

  // 4.2.3：字号小于 5px 时透明节点改为 20% 边框色填充，避免只剩一个空心框。
  const fallbackFill = fontSize < TEXT_VISIBLE_FONT_SIZE && node.color.a === 0;
  if (node.color.a > 0 || fallbackFill) {
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, radius);
    ctx.fillStyle = fallbackFill ? withAlpha(theme.border, 0.2) : rgba(node.color);
    ctx.fill();
  }

  if (node.borderStyle !== "none") {
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, radius);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = borderWidth;
    if (node.borderStyle === "dashed") {
      ctx.setLineDash([12 * camera.scale, 12 * camera.scale]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (fontSize <= TEXT_VISIBLE_FONT_SIZE || node.text.trim() === "") {
    return;
  }

  setFont(ctx, fontSize, node.fontFamily, node.fontWeight);
  const limitWidth =
    node.sizeAdjust === "manual"
      ? Math.max(0, (node.bounds.width - paddingWorld * 2) * camera.scale)
      : Number.POSITIVE_INFINITY;
  const lines = measureLines(ctx, wrapText(ctx, node.text, limitWidth));
  const textTop = rect.y + (paddingWorld + fontSizeWorld / 4) * camera.scale;
  const firstCenterY = textTop + fontSize / 2;
  drawTextLines(
    ctx,
    lines,
    rect.x + paddingWorld * camera.scale,
    firstCenterY,
    fontSize,
    1.5,
    textColorForFill(node.color, theme),
    "left",
  );
}

function drawSectionBackground(
  ctx: CanvasRenderingContext2D,
  section: SceneSection,
  camera: Camera,
  _theme: RenderTheme,
): void {
  if (!section.bounds || section.color.a <= 0 || section.text === "") {
    return;
  }
  // 4.2.3 默认 sectionBackgroundFillMode = "titleOnly"：只填标题条，不填整个分组。
  const rect = screenRect(section.bounds, camera);
  const titleBarHeight = Math.min(
    rect.height,
    SECTION_TITLE_BAR_WORLD_HEIGHT * camera.scale,
  );
  roundedRect(ctx, rect.x, rect.y, rect.width, titleBarHeight, NODE_RADIUS * camera.scale);
  ctx.fillStyle = rgba(section.color);
  ctx.fill();
}

function isSectionBigTitleActive(
  section: SceneSection,
  camera: Camera,
  viewWorld: Bounds,
): boolean {
  if (!section.bounds || section.isCollapsed || section.text.trim() === "") {
    return false;
  }
  const viewMaxSide = Math.max(viewWorld.width, viewWorld.height);
  const sectionMaxSide = Math.max(section.bounds.width, section.bounds.height);
  return (
    sectionMaxSide < viewMaxSide * BIG_TITLE_THRESHOLD_RATIO &&
    camera.scale <= BIG_TITLE_SCALE_THRESHOLD
  );
}

function drawSectionBorderAndTitle(
  ctx: CanvasRenderingContext2D,
  section: SceneSection,
  camera: Camera,
  theme: RenderTheme,
  viewWorld: Bounds,
): void {
  if (!section.bounds) {
    return;
  }
  const rect = screenRect(section.bounds, camera);
  const bigTitleActive = isSectionBigTitleActive(section, camera, viewWorld);
  const borderWidth = bigTitleActive ? 2 : Math.max(0.01, 2 * camera.scale);
  if (section.borderStyle !== "none") {
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, NODE_RADIUS * camera.scale);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = borderWidth;
    if (section.borderStyle === "dashed") {
      const dashLength = bigTitleActive ? 10 : 12 * camera.scale;
      ctx.setLineDash([dashLength, dashLength]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const fontSize = FONT_SIZE * camera.scale;
  if (bigTitleActive || section.text.trim() === "") {
    return;
  }
  setFont(ctx, fontSize);
  const lines = measureLines(ctx, wrapText(ctx, section.text, Number.POSITIVE_INFINITY));
  const firstCenterY = rect.y + NODE_PADDING * camera.scale + fontSize / 2;
  drawTextLines(
    ctx,
    lines,
    rect.x + NODE_PADDING * camera.scale,
    firstCenterY,
    fontSize,
    1.2,
    textColorForFill(section.color, theme),
    "left",
  );
}

interface BigTitleLayout {
  rect: Bounds;
  text: string;
  fontHeight: number;
}

function hasActiveBigTitleAncestor(
  section: SceneSection,
  scene: Scene,
  camera: Camera,
  viewWorld: Bounds,
): boolean {
  let parentUuid = section.parentSectionUuid;
  while (parentUuid) {
    const parent = scene.byUuid.get(parentUuid);
    if (!parent) {
      return false;
    }
    if (parent.kind === "Section" && isSectionBigTitleActive(parent, camera, viewWorld)) {
      return true;
    }
    parentUuid = parent.parentSectionUuid;
  }
  return false;
}

function layoutSectionBigTitle(
  ctx: CanvasRenderingContext2D,
  section: SceneSection,
  camera: Camera,
  viewWorld: Bounds,
  width: number,
  height: number,
): BigTitleLayout | null {
  if (!section.bounds || !isSectionBigTitleActive(section, camera, viewWorld)) {
    return null;
  }

  const rect = screenRect(section.bounds, camera);
  if (Math.max(rect.width, rect.height) < BIG_TITLE_MIN_VIEW_SIZE) {
    return null;
  }
  if (
    rect.x + rect.width < 0 ||
    rect.y + rect.height < 0 ||
    rect.x > width ||
    rect.y > height
  ) {
    return null;
  }

  const text = section.text.replace(/\s*\n\s*/g, " ");
  setFont(ctx, 100);
  const textRatio = ctx.measureText(text).width / 100;
  const rectRatio = rect.width / Math.max(1, rect.height);
  let fontHeight =
    rectRatio < textRatio ? (rect.width / Math.max(textRatio, 0.01)) * 0.9 : rect.height * 0.9;
  fontHeight = Math.max(
    0.1,
    Math.min(fontHeight, Math.max(rect.width, rect.height) * 0.8),
  );
  return { rect, text, fontHeight };
}

function fillSectionBigTitle(
  ctx: CanvasRenderingContext2D,
  section: SceneSection,
  layout: BigTitleLayout,
  theme: RenderTheme,
): void {
  // 4.2.3 只铺半透明底色和文字；边框已在 drawSectionBorderAndTitle 里画过，避免双层。
  // toNewAlpha 是替换 alpha，不是再乘一次。
  ctx.fillStyle =
    section.color.a === 0
      ? withAlpha(theme.background, BIG_TITLE_ALPHA)
      : rgba(section.color, BIG_TITLE_ALPHA);
  ctx.fillRect(layout.rect.x, layout.rect.y, layout.rect.width, layout.rect.height);
}

function drawSectionBigTitleText(
  ctx: CanvasRenderingContext2D,
  section: SceneSection,
  layout: BigTitleLayout,
  theme: RenderTheme,
): void {
  setFont(ctx, layout.fontHeight);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = textColorForFill(section.color, theme);
  ctx.fillText(
    layout.text,
    layout.rect.x + layout.rect.width / 2,
    layout.rect.y + layout.rect.height / 2,
  );
}

function drawConnectPoint(
  ctx: CanvasRenderingContext2D,
  point: SceneConnectPoint,
  camera: Camera,
  theme: RenderTheme,
): void {
  if (!point.bounds) {
    return;
  }
  const center = worldToScreen(camera, rectCenter(point.bounds));
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(1.5, camera.scale), 0, Math.PI * 2);
  ctx.fillStyle = theme.border;
  ctx.fill();
}

function objectRect(scene: Scene, uuid: string): ObjectRect | null {
  const object = scene.byUuid.get(uuid);
  if (!object || !object.bounds) {
    return null;
  }
  return { object, rect: object.bounds, center: rectCenter(object.bounds) };
}

function edgeWidth(scene: Scene, edge: SceneEdge): number {
  const source = scene.byUuid.get(edge.sourceUuid);
  const target = scene.byUuid.get(edge.targetUuid);
  if (source?.kind === "Section" && target?.kind === "Section" && source.bounds && target.bounds) {
    const sourceMax = Math.max(source.bounds.width, source.bounds.height);
    const targetMax = Math.max(target.bounds.width, target.bounds.height);
    return Math.min(Math.min(sourceMax, targetMax) / 100, 100);
  }
  return 2;
}

function edgeColor(color: Rgba, theme: RenderTheme): string {
  return color.a === 0 ? theme.edge : rgba(color);
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  direction: Point,
  size: number,
  color: string,
): void {
  const unit = normalize(direction);
  const back = multiply(unit, -size);
  const radians = (15 * Math.PI) / 180;
  const rotate = (vector: Point, angle: number): Point => ({
    x: vector.x * Math.cos(angle) - vector.y * Math.sin(angle),
    y: vector.x * Math.sin(angle) + vector.y * Math.cos(angle),
  });
  const left = add(tip, rotate(back, radians));
  const middle = add(tip, multiply(back, 0.5));
  const right = add(tip, rotate(back, -radians));

  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(middle.x, middle.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  width: number,
  dashed: boolean,
): void {
  if (dashed) {
    ctx.setLineDash([8 * width, 8 * width]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  edge: SceneEdge,
  camera: Camera,
  theme: RenderTheme,
): void {
  const source = objectRect(scene, edge.sourceUuid);
  const target = objectRect(scene, edge.targetUuid);
  if (!source || !target) {
    return;
  }

  if (edge.kind === "ArcEdge") {
    drawArcEdge(ctx, scene, edge, source, target, camera, theme);
    return;
  }
  drawLineEdge(ctx, scene, edge, source, target, camera, theme);
}

function drawLineEdge(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  edge: SceneLineEdge,
  source: ObjectRect,
  target: ObjectRect,
  camera: Camera,
  theme: RenderTheme,
): void {
  const widthWorld = edgeWidth(scene, edge);
  const width = Math.max(0.01, widthWorld * camera.scale);
  const color = edgeColor(edge.color, theme);
  const startWorld = edgeEndpoint(source, target.center, edge.sourceRate);
  const endWorld = edgeEndpoint(target, source.center, edge.targetRate);
  const start = worldToScreen(camera, startWorld);
  const end = worldToScreen(camera, endWorld);

  if (distance(start, end) < 0.5) {
    return;
  }

  const startDirection =
    source.object.kind === "ConnectPoint" ? { x: 0, y: 0 } : rectNormal(source.rect, startWorld);
  const endDirection =
    target.object.kind === "ConnectPoint" ? { x: 0, y: 0 } : rectNormal(target.rect, endWorld);
  const arrowSizeWorld = 8 * widthWorld;
  const curve = symmetryCurve(
    startWorld,
    endWorld,
    startDirection,
    endDirection,
    arrowSizeWorld,
    lineEdgeBending(startWorld, endWorld),
  );
  drawCurve(ctx, curve, camera, color, width, edge.lineType === "dashed");

  const size = 8 * widthWorld * camera.scale;
  const inwardEnd = multiply(endDirection, -1);
  if (edge.arrowType !== "none") {
    const arrowTip = worldToScreen(camera, endWorld);
    drawArrow(
      ctx,
      arrowTip,
      inwardEnd.x === 0 && inwardEnd.y === 0 ? subtract(arrowTip, start) : inwardEnd,
      size,
      color,
    );
  }
  if (edge.arrowType === "reverse" || edge.arrowType === "both") {
    const inwardStart = multiply(startDirection, -1);
    drawArrow(
      ctx,
      start,
      inwardStart.x === 0 && inwardStart.y === 0 ? subtract(start, end) : inwardStart,
      size,
      color,
    );
  }

  if (edge.text.trim() === "") {
    return;
  }
  const fontSize = FONT_SIZE * camera.scale;
  setFont(ctx, fontSize);
  const lines = measureLines(ctx, wrapText(ctx, edge.text, Number.POSITIVE_INFINITY));
  const textCenter = worldToScreen(camera, cubicPoint(curve, 0.5));
  drawEdgeLabel(ctx, lines, textCenter, fontSize, color, theme.background);
}

function drawArcEdge(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  edge: SceneArcEdge,
  source: ObjectRect,
  target: ObjectRect,
  camera: Camera,
  theme: RenderTheme,
): void {
  const sourceCenter = source.center;
  const targetCenter = target.center;
  const midpoint = {
    x: (sourceCenter.x + targetCenter.x) / 2,
    y: (sourceCenter.y + targetCenter.y) / 2,
  };
  const perpendicular =
    edge.offset === 0
      ? normalize({ x: sourceCenter.y - targetCenter.y, y: targetCenter.x - sourceCenter.x })
      : normalize({ x: targetCenter.y - sourceCenter.y, y: sourceCenter.x - targetCenter.x });
  const control =
    edge.offset === 0
      ? add(midpoint, multiply(perpendicular, 0.0001))
      : add(midpoint, multiply(perpendicular, edge.offset));

  const geometry = arcThroughPoints(sourceCenter, targetCenter, control);
  const startWorld = clipArcToRect(geometry, source.rect, "start");
  const endWorld = clipArcToRect(geometry, target.rect, "end");
  const start = worldToScreen(camera, startWorld);
  const end = worldToScreen(camera, endWorld);

  if (distance(start, end) < 0.5) {
    return;
  }

  const widthWorld = edgeWidth(scene, edge);
  const width = Math.max(0.01, widthWorld * camera.scale);
  const color = edgeColor(edge.color, theme);

  const tStart = arcPosition(geometry, startWorld);
  let tEnd = arcPosition(geometry, endWorld);
  if (tEnd < tStart) {
    tEnd += 1;
  }
  const points = Array.from({ length: 49 }, (_, index) => {
    const t = tStart + ((tEnd - tStart) * index) / 48;
    return worldToScreen(camera, pointOnArcAt(geometry, t));
  });

  ctx.beginPath();
  const first = points[0];
  if (!first) {
    return;
  }
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index] as Point;
    ctx.lineTo(point.x, point.y);
  }
  if (edge.lineType === "dashed") {
    ctx.setLineDash([8 * width, 8 * width]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.setLineDash([]);

  if (points.length < 2) {
    return;
  }
  const endDirection = subtract(end, points[points.length - 2] as Point);
  const size = 8 * widthWorld * camera.scale;
  if (edge.arrowType !== "none") {
    drawArrow(ctx, end, endDirection, size, color);
  }

  if (edge.text.trim() === "") {
    return;
  }
  const fontSize = FONT_SIZE * camera.scale;
  setFont(ctx, fontSize);
  const lines = measureLines(ctx, wrapText(ctx, edge.text, Number.POSITIVE_INFINITY));
  const textCenter = worldToScreen(camera, pointOnArcAt(geometry, edge.textPosition));
  drawEdgeLabel(ctx, lines, textCenter, fontSize, color, theme.background);
}

function drawMultiEdge(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  edge: SceneMultiEdge,
  camera: Camera,
  theme: RenderTheme,
): void {
  const targets = edge.targets
    .map((uuid) => objectRect(scene, uuid))
    .filter((target): target is ObjectRect => target !== null);
  if (targets.length < 2) {
    return;
  }

  const bounds = targets.reduce<Bounds>(
    (accumulator, target) => {
      const left = Math.min(accumulator.x, target.rect.x);
      const top = Math.min(accumulator.y, target.rect.y);
      const right = Math.max(accumulator.x + accumulator.width, target.rect.x + target.rect.width);
      const bottom = Math.max(accumulator.y + accumulator.height, target.rect.y + target.rect.height);
      return { x: left, y: top, width: right - left, height: bottom - top };
    },
    { ...targets[0]!.rect },
  );
  const centerWorld = rectInner(bounds, edge.centerRate);
  const center = worldToScreen(camera, centerWorld);
  const color = edgeColor(edge.color, theme);
  const width = Math.max(0.75, 2 * camera.scale);

  if (edge.renderType === "convex" || edge.renderType === "circle") {
    const points: Point[] = [];
    for (const target of targets) {
      const expanded = rectExpand(target.rect, edge.padding);
      points.push(
        { x: expanded.x, y: expanded.y },
        { x: expanded.x + expanded.width, y: expanded.y },
        { x: expanded.x + expanded.width, y: expanded.y + expanded.height },
        { x: expanded.x, y: expanded.y + expanded.height },
      );
    }
    if (edge.text.trim() !== "") {
      const textSize = 32 * camera.scale * edge.text.length;
      points.push(
        { x: centerWorld.x - textSize / 2, y: centerWorld.y - 20 },
        { x: centerWorld.x + textSize / 2, y: centerWorld.y - 20 },
        { x: centerWorld.x + textSize / 2, y: centerWorld.y + 20 },
        { x: centerWorld.x - textSize / 2, y: centerWorld.y + 20 },
      );
    }

    ctx.beginPath();
    if (edge.renderType === "circle") {
      const centerAverage = points.reduce(
        (accumulator, point) => add(accumulator, point),
        { x: 0, y: 0 },
      );
      const average = {
        x: centerAverage.x / points.length,
        y: centerAverage.y / points.length,
      };
      const radius = points.reduce((maximum, point) => Math.max(maximum, distance(point, average)), 0);
      const screenCenter = worldToScreen(camera, average);
      ctx.arc(screenCenter.x, screenCenter.y, radius * camera.scale, 0, Math.PI * 2);
    } else {
      const hull = convexHull(points);
      hull.forEach((point, index) => {
        const screen = worldToScreen(camera, point);
        if (index === 0) {
          ctx.moveTo(screen.x, screen.y);
        } else {
          ctx.lineTo(screen.x, screen.y);
        }
      });
      ctx.closePath();
    }
    ctx.strokeStyle = edge.color.a === 0 ? theme.edge : rgba(edge.color, 0.5);
    ctx.lineWidth = Math.max(1, 8 * camera.scale);
    ctx.stroke();
  } else {
    const textFontSize = 32 * camera.scale;
    let textLines: TextLine[] = [];
    let textRect: Bounds | null = null;
    if (edge.text.trim() !== "" && textFontSize >= 6) {
      setFont(ctx, textFontSize);
      textLines = measureLines(ctx, wrapText(ctx, edge.text, Number.POSITIVE_INFINITY));
      const textWidth = Math.max(...textLines.map((line) => line.width), 0);
      const textHeight = textLines.length * textFontSize * 1.2;
      textRect = {
        x: center.x - textWidth / 2 - 4,
        y: center.y - textHeight / 2 - 4,
        width: textWidth + 8,
        height: textHeight + 8,
      };
    }

    for (const target of targets) {
      const targetInner = rectInner(target.rect, edge.rectRates[targets.indexOf(target)] ?? { x: 0.5, y: 0.5 });
      const targetBorder = lineRectBorderIntersection(centerWorld, targetInner, target.rect);
      let from = center;
      if (textRect) {
        const intersections = segmentRectIntersections(
          center,
          worldToScreen(camera, targetBorder),
          textRect,
        );
        if (intersections.length > 0) {
          from = intersections[0] as Point;
        }
      }
      drawStroke(
        ctx,
        from,
        worldToScreen(camera, targetBorder),
        color,
        width,
        edge.lineType === "dashed",
      );

      if (edge.arrow === "inner") {
        drawArrow(ctx, center, subtract(center, worldToScreen(camera, targetBorder)), Math.max(4, 15 * camera.scale), color);
      } else if (edge.arrow === "outer") {
        drawArrow(
          ctx,
          worldToScreen(camera, targetBorder),
          subtract(worldToScreen(camera, targetBorder), center),
          Math.max(4, 15 * camera.scale),
          color,
        );
      }
    }

    if (textLines.length > 0) {
      drawTextLines(
        ctx,
        textLines,
        center.x,
        center.y - ((textLines.length - 1) * textFontSize * 1.2) / 2,
        textFontSize,
        1.2,
        color,
      );
    }
  }
}
