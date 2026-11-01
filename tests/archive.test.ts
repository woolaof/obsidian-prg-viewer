import { describe, expect, it } from "vitest";
import { PrgParseError } from "../src/prg/errors";
import { loadPrgArchive } from "../src/prg/archive-loader";
import { parsePrg } from "../src/prg/parser";
import { makePrg } from "./helpers";

describe("archive loader", () => {
  it("loads the four msgpack entries", () => {
    const archive = loadPrgArchive(
      makePrg([], {
        metadata: { version: "2.7.0" },
        tags: ["a"],
        references: { sections: { s: ["t"] }, files: ["x.png"] },
      }),
    );
    expect(archive.metadata.version).toBe("2.7.0");
    expect(archive.tags).toEqual(["a"]);
    expect(archive.references).toEqual({ sections: { s: ["t"] }, files: ["x.png"] });
    expect(archive.stageRaw).toEqual([]);
  });

  it("defaults optional tags and references", () => {
    const archive = loadPrgArchive(makePrg([]));
    expect(archive.tags).toEqual([]);
    expect(archive.references).toEqual({ sections: {}, files: [] });
  });

  it("reports a non-zip input", () => {
    expect(() => loadPrgArchive(new Uint8Array([1, 2, 3]))).toThrow(PrgParseError);
    try {
      loadPrgArchive(new Uint8Array([1, 2, 3]));
    } catch (error) {
      expect((error as PrgParseError).code).toBe("NOT_ZIP");
    }
  });

  it("reports a corrupted zip", () => {
    const corrupted = makePrg([]).slice(0, 20);
    try {
      loadPrgArchive(corrupted);
      throw new Error("expected failure");
    } catch (error) {
      expect((error as PrgParseError).code).toBe("NOT_ZIP");
    }
  });

  it("reports a missing stage", () => {
    try {
      loadPrgArchive(makePrg([], { omitStage: true }));
      throw new Error("expected failure");
    } catch (error) {
      expect((error as PrgParseError).code).toBe("MISSING_STAGE");
    }
  });

  it("reports a missing metadata", () => {
    try {
      loadPrgArchive(makePrg([], { omitMetadata: true }));
      throw new Error("expected failure");
    } catch (error) {
      expect((error as PrgParseError).code).toBe("MISSING_METADATA");
    }
  });

  it("reports a bad metadata version", () => {
    try {
      loadPrgArchive(makePrg([], { metadata: { version: 3 } }));
      throw new Error("expected failure");
    } catch (error) {
      expect((error as PrgParseError).code).toBe("INVALID_METADATA");
    }
  });

  it("rejects an oversized archive entry before decompression", () => {
    const oversized = new Uint8Array(8 * 1024 * 1024 + 1);
    try {
      loadPrgArchive(makePrg([], { thumbnail: oversized }));
      throw new Error("expected failure");
    } catch (error) {
      expect((error as PrgParseError).code).toBe("TOO_LARGE");
    }
  });

  it("reports a non-array stage", () => {
    try {
      loadPrgArchive(makePrg({ not: "an array" }));
      throw new Error("expected failure");
    } catch (error) {
      expect((error as PrgParseError).code).toBe("INVALID_STAGE");
    }
  });
});

describe("parsePrg", () => {
  it("rejects an unsupported version", () => {
    try {
      parsePrg(makePrg([], { metadata: { version: "2.6.0" } }));
      throw new Error("expected failure");
    } catch (error) {
      expect((error as PrgParseError).code).toBe("UNSUPPORTED_VERSION");
    }
  });

  it("rejects a bad ref path", () => {
    try {
      parsePrg(makePrg([{ $: "/9" }]));
      throw new Error("expected failure");
    } catch (error) {
      expect((error as PrgParseError).code).toBe("BAD_REF");
    }
  });
});
