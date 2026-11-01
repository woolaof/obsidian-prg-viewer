import { describe, expect, it } from "vitest";

import {
  buildPrgCodeBlock,
  insertPrgCodeBlock,
  relativeVaultPath,
} from "../src/plugin/insert";

describe("relativeVaultPath", () => {
  it("uses the basename in the same folder", () => {
    expect(relativeVaultPath("学习/图.prg", "学习/笔记.md")).toBe("图.prg");
  });

  it("walks up to a sibling folder", () => {
    expect(relativeVaultPath("资料/图.prg", "学习/笔记.md")).toBe("../资料/图.prg");
  });

  it("keeps a root-level path for a note in the vault root", () => {
    expect(relativeVaultPath("学习/图.prg", "笔记.md")).toBe("学习/图.prg");
  });
});

describe("PRG code block", () => {
  it("builds the fenced block used by the code block processor", () => {
    expect(buildPrgCodeBlock("学习/图.prg")).toBe("```prg-viewer\n学习/图.prg\n```\n");
  });

  it("inserts a block at an empty line", () => {
    let inserted = "";
    const editor = {
      getCursor: () => ({ line: 0, ch: 0 }),
      getLine: () => "",
      replaceSelection: (text: string) => {
        inserted = text;
      },
    };

    insertPrgCodeBlock(editor, "学习/图.prg");

    expect(inserted).toBe("```prg-viewer\n学习/图.prg\n```\n");
  });

  it("starts on a new line when the cursor is not at line start", () => {
    let inserted = "";
    const editor = {
      getCursor: () => ({ line: 0, ch: 2 }),
      getLine: () => "前文",
      replaceSelection: (text: string) => {
        inserted = text;
      },
    };

    insertPrgCodeBlock(editor, "图.prg");

    expect(inserted.startsWith("\n```prg-viewer\n")).toBe(true);
  });
});
