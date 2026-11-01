import { decode } from "@msgpack/msgpack";
import { unzipSync } from "fflate";
import { PrgParseError } from "./errors";
import type { PrgArchive, PrgMetadata, PrgReferences } from "./types";
import { isRecord } from "./utils";

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_STAGE_BYTES = 32 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_AUX_BYTES = 8 * 1024 * 1024;
const ENTRY_LIMITS: Record<string, number> = {
  "stage.msgpack": MAX_STAGE_BYTES,
  "metadata.msgpack": MAX_METADATA_BYTES,
};
const REQUIRED_ENTRIES = new Set([
  "stage.msgpack",
  "metadata.msgpack",
  "tags.msgpack",
  "reference.msgpack",
  "thumbnail.png",
]);

function decodeMsgpack(bytes: Uint8Array, label: string): unknown {
  try {
    return decode(bytes);
  } catch (error) {
    throw new PrgParseError("INVALID_MSGPACK", `${label} 不是有效的 MessagePack 数据`, {
      cause: error,
    });
  }
}

function readMetadata(value: unknown): PrgMetadata {
  if (!isRecord(value) || typeof value.version !== "string" || value.version.trim() === "") {
    throw new PrgParseError("INVALID_METADATA", "metadata.msgpack 缺少字符串字段 version");
  }
  return { ...value, version: value.version.trim() };
}

function readTags(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new PrgParseError("INVALID_TAGS", "tags.msgpack 必须是字符串数组");
  }
  return value;
}

function readReferences(value: unknown): PrgReferences {
  if (value === undefined) {
    return { sections: {}, files: [] };
  }
  if (!isRecord(value) || !isRecord(value.sections) || !Array.isArray(value.files)) {
    throw new PrgParseError("INVALID_REFERENCE", "reference.msgpack 结构无效");
  }
  const sections: Record<string, string[]> = {};
  for (const [key, refs] of Object.entries(value.sections)) {
    if (!Array.isArray(refs) || refs.some((ref) => typeof ref !== "string")) {
      throw new PrgParseError("INVALID_REFERENCE", `reference.msgpack 的 sections.${key} 不是字符串数组`);
    }
    sections[key] = refs;
  }
  if (value.files.some((file) => typeof file !== "string")) {
    throw new PrgParseError("INVALID_REFERENCE", "reference.msgpack 的 files 不是字符串数组");
  }
  return { sections, files: value.files };
}

/**
 * 解开 .prg 的外层 ZIP，并解码四个必需的 MessagePack 文件。
 * 不在这里校验格式版本，版本检查交给 parsePrg。
 */
export function loadPrgArchive(data: Uint8Array): PrgArchive {
  if (data.byteLength > MAX_ARCHIVE_BYTES) {
    throw new PrgParseError(
      "TOO_LARGE",
      `文件过大：${data.byteLength} 字节，上限 ${MAX_ARCHIVE_BYTES} 字节`,
    );
  }

  const oversized = { entry: null as string | null };
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (file) => {
        if (!REQUIRED_ENTRIES.has(file.name)) {
          return false;
        }
        const limit = ENTRY_LIMITS[file.name] ?? MAX_AUX_BYTES;
        if (file.originalSize > limit) {
          oversized.entry = file.name;
          return false;
        }
        return true;
      },
    });
  } catch (error) {
    throw new PrgParseError("NOT_ZIP", "文件不是有效的 ZIP 容器", { cause: error });
  }

  if (oversized.entry) {
    throw new PrgParseError(
      "TOO_LARGE",
      `ZIP 内 ${oversized.entry} 解压后过大，上限 ${ENTRY_LIMITS[oversized.entry] ?? MAX_AUX_BYTES} 字节`,
    );
  }

  const stageBytes = entries["stage.msgpack"];
  if (!stageBytes) {
    throw new PrgParseError("MISSING_STAGE", "ZIP 内缺少 stage.msgpack");
  }
  if (stageBytes.byteLength > MAX_STAGE_BYTES) {
    throw new PrgParseError(
      "TOO_LARGE",
      `stage.msgpack 解压后过大：${stageBytes.byteLength} 字节`,
    );
  }

  const metadataBytes = entries["metadata.msgpack"];
  if (!metadataBytes) {
    throw new PrgParseError("MISSING_METADATA", "ZIP 内缺少 metadata.msgpack");
  }
  if (metadataBytes.byteLength > MAX_METADATA_BYTES) {
    throw new PrgParseError("TOO_LARGE", "metadata.msgpack 过大");
  }

  const metadata = readMetadata(decodeMsgpack(metadataBytes, "metadata.msgpack"));
  const tags =
    entries["tags.msgpack"] === undefined
      ? []
      : readTags(decodeMsgpack(entries["tags.msgpack"], "tags.msgpack"));
  const references =
    entries["reference.msgpack"] === undefined
      ? { sections: {}, files: [] }
      : readReferences(decodeMsgpack(entries["reference.msgpack"], "reference.msgpack"));

  const stageRaw = decodeMsgpack(stageBytes, "stage.msgpack");
  if (!Array.isArray(stageRaw)) {
    throw new PrgParseError("INVALID_STAGE", "stage.msgpack 的顶层必须是数组");
  }

  return {
    metadata,
    tags,
    references,
    stageRaw,
    thumbnail: entries["thumbnail.png"] ?? null,
  };
}
