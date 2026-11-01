import { describe, expect, it } from "vitest";
import { getByPath, isRef, resolveRefs } from "../src/prg/refs";

describe("refs", () => {
  it("recognizes only a single-key $ object", () => {
    expect(isRef({ $: "/1" })).toBe(true);
    expect(isRef({ $: "/1", extra: true })).toBe(false);
    expect(isRef({ $: 1 })).toBe(false);
    expect(isRef([])).toBe(false);
  });

  it("reads array and object segments", () => {
    const root = { a: [{ b: 7 }] };
    expect(getByPath(root, "/a/0/b")).toBe(7);
  });

  it("replaces refs with the referenced value", () => {
    const root = [{ value: 1 }, { $: "/0" }];
    expect(resolveRefs(root)).toEqual([{ value: 1 }, { value: 1 }]);
  });

  it("keeps one shared object for repeated paths", () => {
    const resolved = resolveRefs([{ value: 1 }, { $: "/0" }, { $: "/0" }]) as unknown[];
    expect(resolved[1]).toBe(resolved[2]);
    expect(resolved[1]).not.toBe(resolved[0]);
  });

  it("throws for a missing field", () => {
    expect(() => getByPath([{ value: 1 }], "/0/missing")).toThrow(/不存在的字段/);
  });

  it("throws for a circular ref", () => {
    expect(() => resolveRefs([{ $: "/0" }])).toThrow(/形成循环/);
  });
});
