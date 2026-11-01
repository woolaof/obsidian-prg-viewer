import { describe, expect, it } from "vitest";
import {
  parsePrgSource,
  PrgSourceError,
  resolveRelativeVaultPath,
} from "../src/plugin/source";

describe("PRG code block source", () => {
  it("accepts a plain relative path", () => {
    expect(parsePrgSource("学习/体液调节.prg")).toBe("学习/体液调节.prg");
    expect(parsePrgSource("  学习/体液调节.prg  ")).toBe("学习/体液调节.prg");
  });

  it("accepts wikilinks, quoted paths, and a leading blank line", () => {
    expect(parsePrgSource("![[学习/体液调节.prg]]")).toBe("学习/体液调节.prg");
    expect(parsePrgSource("[[学习/体液调节.prg]]")).toBe("学习/体液调节.prg");
    expect(parsePrgSource("`学习/体液调节.prg`")).toBe("学习/体液调节.prg");
    expect(parsePrgSource("\n\n学习/体液调节.prg")).toBe("学习/体液调节.prg");
  });

  it("rejects empty, non-PRG, and URL sources", () => {
    expect(() => parsePrgSource("  ")).toThrow(PrgSourceError);
    expect(() => parsePrgSource("学习/笔记.md")).toThrow(/\.prg/);
    expect(() => parsePrgSource("https://example.com/a.prg")).toThrow(/网络地址/);
  });

  it("resolves paths relative to the note", () => {
    expect(resolveRelativeVaultPath("图/体液调节.prg", "学习/生物/笔记.md")).toBe(
      "学习/生物/图/体液调节.prg",
    );
    expect(resolveRelativeVaultPath("../图/体液调节.prg", "学习/生物/笔记.md")).toBe(
      "学习/图/体液调节.prg",
    );
    expect(resolveRelativeVaultPath("/图/体液调节.prg", "学习/笔记.md")).toBe("图/体液调节.prg");
    expect(resolveRelativeVaultPath("./图/../图/体液调节.prg", "笔记.md")).toBe("图/体液调节.prg");
  });

  it("rejects paths that leave the vault", () => {
    expect(() => resolveRelativeVaultPath("../../a.prg", "笔记.md")).toThrow(/库根目录/);
  });
});
