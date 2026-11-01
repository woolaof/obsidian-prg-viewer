import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { PrgParseError } from "../src/prg/errors";
import { parsePrg } from "../src/prg/parser";

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error("用法: npm run inspect -- <path/to/file.prg>");
    process.exitCode = 2;
    return;
  }

  const bytes = new Uint8Array(await readFile(file));
  const scene = parsePrg(bytes);
  const missingEdgeEndpoints = [
    ...scene.edges.flatMap((edge) => [edge.sourceUuid, edge.targetUuid]),
    ...scene.multiEdges.flatMap((edge) => edge.targets),
  ].filter((uuid) => !scene.byUuid.has(uuid));

  const summary = {
    file: basename(file),
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    metadataVersion: scene.metadata.version,
    tags: scene.tags,
    references: scene.references,
    thumbnail: scene.thumbnail ? scene.thumbnail.byteLength : null,
    stage: {
      entries: scene.stageEntries,
      inlineEntries: scene.inlineEntries,
      topLevelRefs: scene.refEntries,
      totalRefs: scene.totalRefEntries,
      uniqueObjects: scene.objects.length,
    },
    counts: scene.counts,
    unknownCounts: scene.unknownCounts,
    sections: {
      total: scene.sections.length,
      collapsed: scene.sections.filter((section) => section.isCollapsed).length,
      locked: scene.sections.filter((section) => section.locked).length,
      children: scene.sections.reduce((sum, section) => sum + section.children.length, 0),
      nested: scene.sections.filter((section) => section.parentSectionUuid !== undefined).length,
    },
    edges: {
      total: scene.edges.length + scene.multiEdges.length,
      line: scene.edges.filter((edge) => edge.kind === "LineEdge").length,
      arc: scene.edges.filter((edge) => edge.kind === "ArcEdge").length,
      multi: scene.multiEdges.length,
      missingEndpoints: missingEdgeEndpoints.length,
    },
    bounds: scene.bounds,
    warnings: scene.warnings,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  if (error instanceof PrgParseError) {
    console.error(`[${error.code}] ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
