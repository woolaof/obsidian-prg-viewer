function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

export function relativeVaultPath(targetPath: string, sourcePath: string): string {
  const target = normalize(targetPath).split("/");
  const source = normalize(sourcePath);
  const slash = source.lastIndexOf("/");
  const from = slash >= 0 ? source.slice(0, slash).split("/") : [];
  const to = target;

  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) {
    common += 1;
  }

  const parts = [
    ...Array.from({ length: from.length - common }, () => ".."),
    ...to.slice(common),
  ];
  return parts.join("/");
}

export function buildPrgCodeBlock(path: string): string {
  return `\`\`\`prg-viewer\n${path}\n\`\`\`\n`;
}

export function insertPrgCodeBlock(
  editor: { getCursor(): { line: number; ch: number }; getLine(line: number): string; replaceSelection(text: string): void },
  path: string,
): void {
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line) ?? "";
  const prefix = line.length > 0 ? "\n" : "";
  const suffix = cursor.ch < line.length ? "\n" : "";
  editor.replaceSelection(`${prefix}${buildPrgCodeBlock(path)}${suffix}`);
}
