export class PrgSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrgSourceError";
  }
}

function stripSourceWrappers(value: string): string {
  let result = value.trim();
  if (result.startsWith("```") && result.endsWith("```")) {
    result = result.slice(3, -3).trim();
  }
  if (
    (result.startsWith("[[") && result.endsWith("]]")) ||
    (result.startsWith("![[") && result.endsWith("]]"))
  ) {
    result = result.replace(/^!?\[\[/, "").replace(/\]\]$/, "").trim();
  }
  result = result.replace(/^['"`]+/, "").replace(/['"`]+$/, "").trim();
  return result;
}

export function parsePrgSource(source: string): string {
  const firstLine = source
    .split(/\r?\n/)
    .map((line) => stripSourceWrappers(line))
    .find((line) => line.length > 0);

  if (!firstLine) {
    throw new PrgSourceError("代码块需要填写 .prg 文件路径，例如：学习/体液调节.prg");
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(firstLine)) {
    throw new PrgSourceError("只支持打开库内文件，不支持网络地址");
  }
  const path = firstLine.replace(/\\/g, "/").trim();
  if (!path.toLowerCase().endsWith(".prg")) {
    throw new PrgSourceError(`路径必须以 .prg 结尾：${path}`);
  }
  return path;
}

export function resolveRelativeVaultPath(target: string, sourcePath: string): string {
  const normalizedTarget = target.replace(/\\/g, "/").trim();
  if (normalizedTarget.startsWith("/")) {
    return normalizeVaultPath(normalizedTarget);
  }
  const slash = sourcePath.lastIndexOf("/");
  const directory = slash >= 0 ? sourcePath.slice(0, slash) : "";
  return normalizeVaultPath(directory.length > 0 ? `${directory}/${normalizedTarget}` : normalizedTarget);
}

export function normalizeVaultPath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        throw new PrgSourceError(`路径超出库根目录：${path}`);
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    throw new PrgSourceError(`路径为空：${path}`);
  }
  return segments.join("/");
}
