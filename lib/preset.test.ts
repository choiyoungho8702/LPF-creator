import { describe, expect, it } from "vitest";

import { parsePreset, serializePreset, type LpfPreset } from "@/lib/preset";

describe("preset", () => {
  const preset: LpfPreset = {
    cutoffFrequency: 1200,
    order: 4,
    blockSize: 32,
    arithmeticMode: "fixed",
    qFormatName: "Q15",
  };

  it("직렬화한 JSON을 다시 파싱하면 원래 값으로 복원된다", () => {
    expect(parsePreset(serializePreset(preset))).toEqual(preset);
  });

  it("필수 필드가 빠진 JSON은 에러를 던진다", () => {
    expect(() => parsePreset(JSON.stringify({ cutoffFrequency: 1000 }))).toThrow();
  });

  it("JSON 형식이 아니면 에러를 던진다", () => {
    expect(() => parsePreset("not json")).toThrow();
  });
});
