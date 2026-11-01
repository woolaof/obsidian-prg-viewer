import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePrg } from "../src/prg/parser";
import { lineEdge, makePrg, section, textNode } from "./helpers";

const fixturePath = fileURLToPath(
  new URL("../test-fixtures/fixture.prg", import.meta.url),
);
const fixtureExists = existsSync(fixturePath);

describe("synthetic scene", () => {
  const stage = [
    textNode("t1", "一", 0, 0),
    textNode("t2", "二", 200, 0),
    section("s1", [{ $: "/0" }], 0, 0, 300, 200),
    lineEdge("e1", "/0", "/1"),
    { $: "/0" },
  ];

  it("resolves refs, dedupes, and links children and edges", () => {
    const scene = parsePrg(makePrg(stage));

    expect(scene.stageEntries).toBe(5);
    expect(scene.refEntries).toBe(1);
    expect(scene.inlineEntries).toBe(4);
    expect(scene.totalRefEntries).toBe(4);
    expect(scene.objects).toHaveLength(4);
    expect(scene.byUuid.size).toBe(4);
    expect(scene.counts).toEqual({ LineEdge: 1, Section: 1, TextNode: 2 });
    expect(scene.unknownCounts).toEqual({});
    expect(scene.warnings).toEqual([]);

    expect(scene.sections[0]?.children).toEqual(["t1"]);
    expect(scene.texts.find((text) => text.uuid === "t1")?.parentSectionUuid).toBe("s1");
    expect(scene.texts.find((text) => text.uuid === "t2")?.parentSectionUuid).toBeUndefined();

    expect(scene.edges[0]?.sourceUuid).toBe("t1");
    expect(scene.edges[0]?.targetUuid).toBe("t2");
    expect(scene.bounds).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });

  it("keeps unknown types out of the renderable set", () => {
    const scene = parsePrg(makePrg([{ _: "FutureNode", uuid: "f1" }]));

    expect(scene.objects).toHaveLength(1);
    expect(scene.unknown).toHaveLength(1);
    expect(scene.unknown[0]?.sourceTag).toBe("FutureNode");
    expect(scene.counts).toEqual({ FutureNode: 1 });
    expect(scene.unknownCounts).toEqual({ FutureNode: 1 });
    expect(scene.warnings.join("\n")).toMatch(/FutureNode/);
    expect(scene.bounds).toBeNull();
  });
});

if (fixtureExists) {
  describe("provided fixture", () => {
  const bytes = new Uint8Array(readFileSync(fixturePath));
  const scene = parsePrg(bytes);

  it("is the file described by the task book", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "7e14bc538a1eccd669f11e1eae3b392d629d249193906525f7823cb995766a25",
    );
    expect(bytes.byteLength).toBe(162242);
    expect(scene.metadata.version).toBe("2.7.0");
    expect(scene.tags).toEqual([]);
    expect(scene.references).toEqual({ sections: {}, files: [] });
    expect(scene.thumbnail?.byteLength).toBe(22569);
  });

  it("matches the 413/193/34/174 baseline", () => {
    expect(scene.stageEntries).toBe(413);
    expect(scene.refEntries).toBe(190);
    expect(scene.inlineEntries).toBe(223);
    expect(scene.totalRefEntries).toBe(575);
    expect(scene.objects).toHaveLength(413);
    expect(scene.counts).toEqual({
      ArcEdge: 10,
      ConnectPoint: 1,
      LineEdge: 174,
      MultiTargetUndirectedEdge: 1,
      Section: 34,
      TextNode: 193,
    });
    expect(scene.unknown).toEqual([]);
    expect(scene.unknownCounts).toEqual({});
    expect(scene.warnings).toEqual([]);
  });

  it("links every section child and edge endpoint", () => {
    expect(scene.sections).toHaveLength(34);
    expect(scene.sections.reduce((sum, section) => sum + section.children.length, 0)).toBe(205);
    expect(scene.sections.filter((section) => section.parentSectionUuid)).toHaveLength(27);
    expect(scene.sections.every((section) => section.isCollapsed === false)).toBe(true);
    expect(scene.sections.every((section) => section.locked === false)).toBe(true);

    for (const section of scene.sections) {
      for (const child of section.children) {
        expect(scene.byUuid.has(child)).toBe(true);
      }
    }
    expect(scene.edges).toHaveLength(184);
    expect(scene.multiEdges).toHaveLength(1);
    for (const edge of scene.edges) {
      expect(scene.byUuid.has(edge.sourceUuid)).toBe(true);
      expect(scene.byUuid.has(edge.targetUuid)).toBe(true);
    }
    for (const edge of scene.multiEdges) {
      for (const target of edge.targets) {
        expect(scene.byUuid.has(target)).toBe(true);
      }
    }
  });

  it("computes a finite bounds close to the SVG export", () => {
    expect(scene.bounds).not.toBeNull();
    expect(scene.bounds?.x).toBeCloseTo(-2215.79, 2);
    expect(scene.bounds?.y).toBeCloseTo(-2228.55, 2);
    expect(scene.bounds?.width).toBeCloseTo(6775.17, 2);
    expect(scene.bounds?.height).toBeCloseTo(8117.62, 2);
  });

  it("is deterministic", () => {
    const again = parsePrg(bytes);
    expect(again.counts).toEqual(scene.counts);
    expect(again.bounds).toEqual(scene.bounds);
    expect(again.warnings).toEqual(scene.warnings);
    expect(again.sections.map((section) => section.children)).toEqual(
      scene.sections.map((section) => section.children),
    );
  });
});
}
