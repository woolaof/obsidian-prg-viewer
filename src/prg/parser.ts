import { loadPrgArchive } from "./archive-loader";
import { PrgParseError } from "./errors";
import { resolveRefs } from "./refs";
import { assertSupportedVersion, buildScene, type Scene } from "./scene";

export function parsePrg(data: Uint8Array): Scene {
  const archive = loadPrgArchive(data);
  assertSupportedVersion(archive.metadata.version);

  const resolved = resolveRefs(archive.stageRaw);
  if (!Array.isArray(resolved)) {
    throw new PrgParseError("INVALID_STAGE", "解析引用后 stage 不再是数组");
  }

  return buildScene(resolved, archive);
}
