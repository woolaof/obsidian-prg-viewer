import { encode } from "@msgpack/msgpack";
import { zipSync } from "fflate";

export interface MakePrgOptions {
  metadata?: unknown;
  tags?: unknown;
  references?: unknown;
  thumbnail?: Uint8Array;
  omitStage?: boolean;
  omitMetadata?: boolean;
}

export function makePrg(stage: unknown, options: MakePrgOptions = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  if (!options.omitStage) {
    files["stage.msgpack"] = encode(stage);
  }
  if (!options.omitMetadata) {
    files["metadata.msgpack"] = encode(options.metadata ?? { version: "2.7.0" });
  }
  if (options.tags !== undefined) {
    files["tags.msgpack"] = encode(options.tags);
  }
  if (options.references !== undefined) {
    files["reference.msgpack"] = encode(options.references);
  }
  if (options.thumbnail !== undefined) {
    files["thumbnail.png"] = options.thumbnail;
  }
  return zipSync(files);
}

export function textNode(
  uuid: string,
  text: string,
  x: number,
  y: number,
  width = 100,
  height = 40,
): Record<string, unknown> {
  return {
    _: "TextNode",
    uuid,
    text,
    collisionBox: {
      _: "CollisionBox",
      shapes: [
        {
          _: "Rectangle",
          location: { _: "Vector", x, y },
          size: { _: "Vector", x: width, y: height },
        },
      ],
    },
    color: { _: "Color", r: 0, g: 0, b: 0, a: 0 },
    fontScaleLevel: 0,
    sizeAdjust: "auto",
    fontFamily: "",
    fontWeight: "",
    borderStyle: "solid",
  };
}

export function section(
  uuid: string,
  children: unknown[],
  x: number,
  y: number,
  width: number,
  height: number,
): Record<string, unknown> {
  return {
    _: "Section",
    uuid,
    text: "节",
    children,
    _collisionBoxNormal: {
      _: "CollisionBox",
      shapes: [
        {
          _: "Rectangle",
          location: { _: "Vector", x, y },
          size: { _: "Vector", x: width, y: height },
        },
      ],
    },
    color: { _: "Color", r: 235, g: 230, b: 190, a: 1 },
    isCollapsed: false,
    locked: false,
    borderStyle: "solid",
  };
}

export function lineEdge(
  uuid: string,
  source: string,
  target: string,
): Record<string, unknown> {
  return {
    _: "LineEdge",
    uuid,
    associationList: [{ $: source }, { $: target }],
    sourceRectangleRate: { _: "Vector", x: 0.5, y: 0.5 },
    targetRectangleRate: { _: "Vector", x: 0.5, y: 0.5 },
    color: { _: "Color", r: 0, g: 0, b: 0, a: 0 },
    text: "",
    lineType: "solid",
    arrowType: "default",
  };
}
