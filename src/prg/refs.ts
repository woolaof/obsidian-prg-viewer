import { PrgParseError } from "./errors";
import { isRecord } from "./utils";

export interface SerializedRef {
  $: string;
}

export function isRef(value: unknown): value is SerializedRef {
  return isRecord(value) && Object.keys(value).length === 1 && typeof value.$ === "string";
}

export function normalizeRefPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function getByPath(root: unknown, path: string): unknown {
  const normalized = normalizeRefPath(path);
  let current: unknown = root;

  for (const segment of normalized.slice(1).split("/")) {
    if (segment === "") {
      continue;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new PrgParseError("BAD_REF", `引用路径 ${path} 指向不存在的数组下标 ${segment}`);
      }
      current = current[index];
      continue;
    }
    if (isRecord(current)) {
      if (!(segment in current)) {
        throw new PrgParseError("BAD_REF", `引用路径 ${path} 指向不存在的字段 ${segment}`);
      }
      current = current[segment];
      continue;
    }
    throw new PrgParseError("BAD_REF", `引用路径 ${path} 在字段 ${segment} 处无法继续解析`);
  }

  return current;
}

/**
 * 把序列化数据里的 { "$": "/5/children/2" } 还原成对象引用。
 *
 * 官方 serializer 的 deserialize 会先做同样的路径替换，再按 `_`
 * 查找已注册的类。插件不引入 GPL 的场景类，因此这里只做路径替换，
 * 让调用方拿到普通对象。
 */
export function resolveRefs(root: unknown): unknown {
  const cache = new Map<string, unknown>();
  const resolving = new Set<string>();

  const resolveValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => resolveValue(item));
    }
    if (isRef(value)) {
      const path = normalizeRefPath(value.$);
      if (cache.has(path)) {
        return cache.get(path);
      }
      if (resolving.has(path)) {
        throw new PrgParseError("CIRCULAR_REF", `引用路径 ${path} 形成循环`);
      }
      resolving.add(path);
      try {
        const target = getByPath(root, path);
        const resolved = resolveValue(target);
        cache.set(path, resolved);
        return resolved;
      } finally {
        resolving.delete(path);
      }
    }
    if (isRecord(value)) {
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        result[key] = resolveValue(child);
      }
      return result;
    }
    return value;
  };

  return resolveValue(root);
}

export function countRefs(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, item) => sum + countRefs(item), 0);
  }
  if (isRef(value)) {
    return 1;
  }
  if (isRecord(value)) {
    return Object.values(value).reduce<number>((sum, child) => sum + countRefs(child), 0);
  }
  return 0;
}

export function countTopLevelRefs(stage: unknown[]): number {
  return stage.filter(isRef).length;
}
