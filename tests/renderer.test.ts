import { describe, expect, it } from "vitest";

import type { Scene, SceneEdge } from "../src/prg/scene";
import { edgeWidth } from "../src/render/renderer";

function sceneWith(source: unknown, target: unknown): Scene {
  return {
    byUuid: new Map([
      ["source", source],
      ["target", target],
    ]),
  } as unknown as Scene;
}

const lineEdge = { sourceUuid: "source", targetUuid: "target" } as SceneEdge;

describe("edge width", () => {
  it("uses the source text node border width", () => {
    const scene = sceneWith(
      { kind: "TextNode", fontScaleLevel: 6 },
      { kind: "Section", bounds: { width: 500, height: 300 } },
    );
    expect(edgeWidth(scene, lineEdge)).toBe(16);
  });

  it("keeps the 2px default for a section source", () => {
    const scene = sceneWith(
      { kind: "Section", bounds: { width: 500, height: 300 } },
      { kind: "TextNode", fontScaleLevel: 6 },
    );
    expect(edgeWidth(scene, lineEdge)).toBe(2);
  });

  it("keeps the automatic section-to-section width", () => {
    const scene = sceneWith(
      { kind: "Section", bounds: { width: 800, height: 400 } },
      { kind: "Section", bounds: { width: 600, height: 900 } },
    );
    expect(edgeWidth(scene, lineEdge)).toBe(8);
  });
});
