import { PrgParseError } from "./errors";
import { countRefs, countTopLevelRefs } from "./refs";
import type { PrgArchive, PrgMetadata, PrgReferences } from "./types";
import { asBoolean, asNumber, asString, isRecord } from "./utils";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SceneObjectKind =
  | "TextNode"
  | "Section"
  | "ConnectPoint"
  | "LineEdge"
  | "ArcEdge"
  | "MultiTargetUndirectedEdge"
  | "Unknown";

export interface SceneBase {
  uuid: string;
  kind: SceneObjectKind;
  bounds: Bounds | null;
  parentSectionUuid?: string;
}

export interface SceneTextNode extends SceneBase {
  kind: "TextNode";
  text: string;
  color: Rgba;
  fontScaleLevel: number;
  sizeAdjust: string;
  fontFamily: string;
  fontWeight: string;
  borderStyle: string;
}

export interface SceneSection extends SceneBase {
  kind: "Section";
  text: string;
  color: Rgba;
  borderStyle: string;
  isCollapsed: boolean;
  locked: boolean;
  children: string[];
}

export interface SceneConnectPoint extends SceneBase {
  kind: "ConnectPoint";
}

export interface SceneEdgeBase extends SceneBase {
  text: string;
  color: Rgba;
  lineType: string;
  arrowType: string;
  sourceUuid: string;
  targetUuid: string;
  sourceRate: Vec2;
  targetRate: Vec2;
}

export interface SceneLineEdge extends SceneEdgeBase {
  kind: "LineEdge";
}

export interface SceneArcEdge extends SceneEdgeBase {
  kind: "ArcEdge";
  offset: number;
  textPosition: number;
}

export interface SceneMultiEdge extends SceneBase {
  kind: "MultiTargetUndirectedEdge";
  text: string;
  color: Rgba;
  targets: string[];
  rectRates: Vec2[];
  centerRate: Vec2;
  arrow: string;
  renderType: string;
  lineType: string;
  padding: number;
}

export interface SceneUnknown extends SceneBase {
  kind: "Unknown";
  sourceTag: string;
}

export type SceneEdge = SceneLineEdge | SceneArcEdge;
export type SceneObject =
  | SceneTextNode
  | SceneSection
  | SceneConnectPoint
  | SceneEdge
  | SceneMultiEdge
  | SceneUnknown;

export interface Scene {
  metadata: PrgMetadata;
  tags: string[];
  references: PrgReferences;
  thumbnail: Uint8Array | null;
  stageEntries: number;
  refEntries: number;
  inlineEntries: number;
  totalRefEntries: number;
  objects: SceneObject[];
  byUuid: Map<string, SceneObject>;
  texts: SceneTextNode[];
  sections: SceneSection[];
  connectPoints: SceneConnectPoint[];
  edges: SceneEdge[];
  multiEdges: SceneMultiEdge[];
  unknown: SceneUnknown[];
  counts: Record<string, number>;
  unknownCounts: Record<string, number>;
  warnings: string[];
  bounds: Bounds | null;
}

const KNOWN_TAGS = new Set([
  "TextNode",
  "Section",
  "ConnectPoint",
  "LineEdge",
  "ArcEdge",
  "MultiTargetUndirectedEdge",
]);

const KIND_ORDER: Record<SceneObjectKind, number> = {
  Section: 0,
  TextNode: 1,
  ConnectPoint: 2,
  LineEdge: 3,
  ArcEdge: 4,
  MultiTargetUndirectedEdge: 5,
  Unknown: 6,
};

function readVec(value: unknown): Vec2 | null {
  if (!isRecord(value) || typeof value.x !== "number" || typeof value.y !== "number") {
    return null;
  }
  return { x: value.x, y: value.y };
}

function readColor(value: unknown): Rgba {
  if (!isRecord(value)) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: asNumber(value.r),
    g: asNumber(value.g),
    b: asNumber(value.b),
    a: asNumber(value.a),
  };
}

function normalizeBounds(x1: number, y1: number, x2: number, y2: number): Bounds {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function unionBounds(left: Bounds | null, right: Bounds): Bounds {
  if (left === null) {
    return right;
  }
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: maxX - x, height: maxY - y };
}

function shapeBounds(shape: unknown, label: string, warnings: Set<string>): Bounds | null {
  if (!isRecord(shape) || typeof shape._ !== "string") {
    warnings.add(`${label} 含没有 _ 标记的图形`);
    return null;
  }

  if (shape._ === "Rectangle") {
    const location = readVec(shape.location);
    const size = readVec(shape.size);
    if (!location || !size) {
      warnings.add(`${label} 的 Rectangle 缺少 location 或 size`);
      return null;
    }
    return normalizeBounds(
      location.x,
      location.y,
      location.x + size.x,
      location.y + size.y,
    );
  }

  if (shape._ === "Line") {
    const start = readVec(shape.start);
    const end = readVec(shape.end);
    if (!start || !end) {
      warnings.add(`${label} 的 Line 缺少 start 或 end`);
      return null;
    }
    return normalizeBounds(start.x, start.y, end.x, end.y);
  }

  if (shape._ === "Circle") {
    const center = readVec(shape.center);
    const radius = asNumber(shape.radius, Number.NaN);
    if (!center || !Number.isFinite(radius)) {
      warnings.add(`${label} 的 Circle 缺少 center 或 radius`);
      return null;
    }
    return normalizeBounds(
      center.x - radius,
      center.y - radius,
      center.x + radius,
      center.y + radius,
    );
  }

  warnings.add(`${label} 含暂不支持的图形类型 ${shape._}`);
  return null;
}

function readCollisionBounds(
  value: unknown,
  label: string,
  warnings: Set<string>,
): Bounds | null {
  if (!isRecord(value) || !Array.isArray(value.shapes)) {
    warnings.add(`${label} 缺少 collisionBox.shapes`);
    return null;
  }

  let result: Bounds | null = null;
  for (const shape of value.shapes) {
    const bounds = shapeBounds(shape, label, warnings);
    if (bounds) {
      result = unionBounds(result, bounds);
    }
  }
  if (result === null) {
    warnings.add(`${label} 的 collisionBox 没有可用图形`);
  }
  return result;
}

function readObjectUuid(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (isRecord(value) && typeof value.uuid === "string" && value.uuid.length > 0) {
    return value.uuid;
  }
  return null;
}

function readRate(value: unknown): Vec2 {
  return readVec(value) ?? { x: 0.5, y: 0.5 };
}

function collectRawObjects(
  stage: unknown[],
  warnings: Set<string>,
): Map<string, Record<string, unknown>> {
  const rawByUuid = new Map<string, Record<string, unknown>>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!isRecord(value)) {
      return;
    }

    const tag = typeof value._ === "string" ? value._ : null;
    const uuid = typeof value.uuid === "string" ? value.uuid : null;
    if (tag && uuid) {
      const existing = rawByUuid.get(uuid);
      if (existing === undefined) {
        rawByUuid.set(uuid, value);
      } else if (existing._ !== tag) {
        warnings.add(`uuid ${uuid} 同时标记为 ${String(existing._)} 和 ${tag}`);
      }
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  };

  visit(stage);
  return rawByUuid;
}

function buildBaseObject(
  raw: Record<string, unknown>,
  warnings: Set<string>,
): SceneObject | null {
  const tag = typeof raw._ === "string" ? raw._ : null;
  const uuid = typeof raw.uuid === "string" ? raw.uuid : null;
  if (!tag || !uuid) {
    return null;
  }

  if (tag === "TextNode") {
    return {
      kind: "TextNode",
      uuid,
      bounds: readCollisionBounds(raw.collisionBox, `TextNode ${uuid}`, warnings),
      text: asString(raw.text),
      color: readColor(raw.color),
      fontScaleLevel: asNumber(raw.fontScaleLevel),
      sizeAdjust: asString(raw.sizeAdjust, "auto"),
      fontFamily: asString(raw.fontFamily),
      fontWeight: asString(raw.fontWeight),
      borderStyle: asString(raw.borderStyle, "solid"),
    };
  }

  if (tag === "Section") {
    const normal = readCollisionBounds(raw._collisionBoxNormal, `Section ${uuid}`, warnings);
    return {
      kind: "Section",
      uuid,
      bounds:
        normal ?? readCollisionBounds(raw.collisionBox, `Section ${uuid}`, warnings),
      text: asString(raw.text),
      color: readColor(raw.color),
      borderStyle: asString(raw.borderStyle, "solid"),
      isCollapsed: asBoolean(raw.isCollapsed),
      locked: asBoolean(raw.locked),
      children: [],
    };
  }

  if (tag === "ConnectPoint") {
    return {
      kind: "ConnectPoint",
      uuid,
      bounds: readCollisionBounds(raw.collisionBox, `ConnectPoint ${uuid}`, warnings),
    };
  }

  if (tag === "LineEdge") {
    const endpoints = readEdgeEndpoints(raw, uuid, warnings);
    if (!endpoints) {
      return null;
    }
    return {
      kind: "LineEdge",
      uuid,
      bounds: null,
      ...endpoints,
      text: asString(raw.text),
      color: readColor(raw.color),
      lineType: asString(raw.lineType, "solid"),
      arrowType: asString(raw.arrowType, "default"),
    };
  }

  if (tag === "ArcEdge") {
    const endpoints = readEdgeEndpoints(raw, uuid, warnings);
    if (!endpoints) {
      return null;
    }
    return {
      kind: "ArcEdge",
      uuid,
      bounds: null,
      ...endpoints,
      text: asString(raw.text),
      color: readColor(raw.color),
      lineType: asString(raw.lineType, "solid"),
      arrowType: asString(raw.arrowType, "default"),
      offset: asNumber(raw.offset),
      textPosition: asNumber(raw.textPosition, 0.5),
    };
  }

  if (tag === "MultiTargetUndirectedEdge") {
    const rawTargets = Array.isArray(raw.associationList) ? raw.associationList : [];
    const targets = rawTargets
      .map(readObjectUuid)
      .filter((target): target is string => target !== null);
    if (targets.length < 2) {
      warnings.add(`MultiTargetUndirectedEdge ${uuid} 的有效端点少于 2 个`);
      return null;
    }
    const rawRates = Array.isArray(raw.rectRates) ? raw.rectRates : [];
    return {
      kind: "MultiTargetUndirectedEdge",
      uuid,
      bounds: null,
      text: asString(raw.text),
      color: readColor(raw.color),
      targets,
      rectRates: targets.map((_, index) => readRate(rawRates[index])),
      centerRate: readRate(raw.centerRate),
      arrow: asString(raw.arrow, "none"),
      renderType: asString(raw.renderType, "line"),
      lineType: asString(raw.lineType, "solid"),
      padding: asNumber(raw.padding, 10),
    };
  }

  warnings.add(`未知对象类型 ${tag}（${uuid}），已跳过渲染`);
  return {
    kind: "Unknown",
    uuid,
    bounds: null,
    sourceTag: tag,
  };
}

function readEdgeEndpoints(
  raw: Record<string, unknown>,
  uuid: string,
  warnings: Set<string>,
): Pick<SceneEdgeBase, "sourceUuid" | "targetUuid" | "sourceRate" | "targetRate"> | null {
  const associations = Array.isArray(raw.associationList) ? raw.associationList : [];
  if (associations.length !== 2) {
    warnings.add(`${String(raw._)} ${uuid} 的 associationList 长度不是 2`);
    return null;
  }
  const sourceUuid = readObjectUuid(associations[0]);
  const targetUuid = readObjectUuid(associations[1]);
  if (!sourceUuid || !targetUuid) {
    warnings.add(`${String(raw._)} ${uuid} 的 associationList 含无效端点`);
    return null;
  }
  return {
    sourceUuid,
    targetUuid,
    sourceRate: readRate(raw.sourceRectangleRate),
    targetRate: readRate(raw.targetRectangleRate),
  };
}

function assignParents(
  rawByUuid: Map<string, Record<string, unknown>>,
  byUuid: Map<string, SceneObject>,
  warnings: Set<string>,
): void {
  for (const [uuid, raw] of rawByUuid) {
    if (raw._ !== "Section") {
      continue;
    }
    const section = byUuid.get(uuid);
    if (section?.kind !== "Section") {
      continue;
    }

    const rawChildren = Array.isArray(raw.children) ? raw.children : [];
    const childUuids: string[] = [];
    const seen = new Set<string>();
    for (const rawChild of rawChildren) {
      const childUuid = readObjectUuid(rawChild);
      if (!childUuid) {
        warnings.add(`Section ${uuid} 含没有 uuid 的子对象`);
        continue;
      }
      if (seen.has(childUuid)) {
        continue;
      }
      seen.add(childUuid);
      childUuids.push(childUuid);

      const child = byUuid.get(childUuid);
      if (!child) {
        warnings.add(`Section ${uuid} 的子对象 ${childUuid} 不在对象表中`);
        continue;
      }
      if (child.parentSectionUuid === undefined) {
        child.parentSectionUuid = uuid;
      } else if (child.parentSectionUuid !== uuid) {
        warnings.add(
          `对象 ${childUuid} 同时出现在 Section ${child.parentSectionUuid} 和 ${uuid}`,
        );
      }
    }
    section.children = childUuids;
  }
}

function sortCounts(values: Map<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of [...values.keys()].sort()) {
    result[key] = values.get(key) ?? 0;
  }
  return result;
}

export function buildScene(stage: unknown[], archive: PrgArchive): Scene {
  const warnings = new Set<string>();
  const rawByUuid = collectRawObjects(stage, warnings);
  const byUuid = new Map<string, SceneObject>();

  for (const [uuid, raw] of rawByUuid) {
    const object = buildBaseObject(raw, warnings);
    if (object) {
      byUuid.set(uuid, object);
    }
  }

  assignParents(rawByUuid, byUuid, warnings);

  for (const [uuid, object] of byUuid) {
    if (object.kind === "LineEdge" || object.kind === "ArcEdge") {
      for (const endpoint of [object.sourceUuid, object.targetUuid]) {
        if (!byUuid.has(endpoint)) {
          warnings.add(`边 ${uuid} 的端点 ${endpoint} 不在对象表中`);
        }
      }
    }
    if (object.kind === "MultiTargetUndirectedEdge") {
      for (const target of object.targets) {
        if (!byUuid.has(target)) {
          warnings.add(`多目标边 ${uuid} 的端点 ${target} 不在对象表中`);
        }
      }
    }
  }

  const objects = [...byUuid.values()].sort((left, right) => {
    const kindDelta = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
    return kindDelta !== 0 ? kindDelta : left.uuid.localeCompare(right.uuid);
  });

  const texts = objects.filter((object): object is SceneTextNode => object.kind === "TextNode");
  const sections = objects.filter((object): object is SceneSection => object.kind === "Section");
  const connectPoints = objects.filter(
    (object): object is SceneConnectPoint => object.kind === "ConnectPoint",
  );
  const edges = objects.filter((object): object is SceneEdge => {
    return object.kind === "LineEdge" || object.kind === "ArcEdge";
  });
  const multiEdges = objects.filter(
    (object): object is SceneMultiEdge => object.kind === "MultiTargetUndirectedEdge",
  );
  const unknown = objects.filter(
    (object): object is SceneUnknown => object.kind === "Unknown",
  );

  const typeCounts = new Map<string, number>();
  const unknownCounts = new Map<string, number>();
  for (const raw of rawByUuid.values()) {
    const tag = typeof raw._ === "string" ? raw._ : "Unknown";
    typeCounts.set(tag, (typeCounts.get(tag) ?? 0) + 1);
    if (!KNOWN_TAGS.has(tag)) {
      unknownCounts.set(tag, (unknownCounts.get(tag) ?? 0) + 1);
    }
  }

  let bounds: Bounds | null = null;
  for (const object of objects) {
    if (object.bounds) {
      bounds = unionBounds(bounds, object.bounds);
    }
  }

  const stageEntries = archive.stageRaw.length;
  const refEntries = countTopLevelRefs(archive.stageRaw);

  return {
    metadata: archive.metadata,
    tags: archive.tags,
    references: archive.references,
    thumbnail: archive.thumbnail,
    stageEntries,
    refEntries,
    inlineEntries: stageEntries - refEntries,
    totalRefEntries: countRefs(archive.stageRaw),
    objects,
    byUuid,
    texts,
    sections,
    connectPoints,
    edges,
    multiEdges,
    unknown,
    counts: sortCounts(typeCounts),
    unknownCounts: sortCounts(unknownCounts),
    warnings: [...warnings].sort(),
    bounds,
  };
}

export function assertSupportedVersion(version: string): void {
  if (version !== "2.7.0") {
    throw new PrgParseError(
      "UNSUPPORTED_VERSION",
      `不支持 PRG 格式版本 ${version}；当前只支持 2.7.0。请先用 Project Graph 打开并另存为 2.7.0。`,
    );
  }
}
