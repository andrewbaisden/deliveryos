import { describe, expect, it } from "vitest";
import { compareStreamIds } from "./stream";

describe("SSE stream cursor helpers", () => {
  it("orders redis stream ids by millisecond then sequence", () => {
    expect(compareStreamIds("1000-0", "1000-1")).toBe(-1);
    expect(compareStreamIds("1001-0", "1000-9")).toBe(1);
    expect(compareStreamIds("1000-3", "1000-3")).toBe(0);
  });

  it("treats expired cursors as older than the earliest retained id", () => {
    const earliest = "1700000000000-0";
    const expired = "1600000000000-0";
    expect(compareStreamIds(expired, earliest)).toBe(-1);
  });
});
