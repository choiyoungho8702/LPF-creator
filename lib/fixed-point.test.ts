import { describe, expect, it } from "vitest";

import { QFormat, quantizeToFixedPoint } from "@/lib/fixed-point";

describe("quantizeToFixedPoint", () => {
  it("Q15(16비트, 15 fractional bit)로 0.5를 16384로 양자화한다", () => {
    expect(quantizeToFixedPoint(0.5, QFormat.Q15)).toBe(16384);
  });

  it("Q15에서 표현 가능한 최소값 -1.0은 -32768로 정확히 양자화된다", () => {
    expect(quantizeToFixedPoint(-1.0, QFormat.Q15)).toBe(-32768);
  });

  it("Q15 표현 범위를 초과하는 값(1.5)은 최대값 32767로 saturate된다", () => {
    expect(quantizeToFixedPoint(1.5, QFormat.Q15)).toBe(32767);
  });

  it("Q15 표현 범위 미만(-1.5)은 최소값 -32768로 saturate된다", () => {
    expect(quantizeToFixedPoint(-1.5, QFormat.Q15)).toBe(-32768);
  });

  it("Q31(32비트, 31 fractional bit)로 0.5를 1073741824로 양자화한다", () => {
    expect(quantizeToFixedPoint(0.5, QFormat.Q31)).toBe(1073741824);
  });

  it("Q23(32비트, 23 fractional bit)로 2.0을 16777216으로 양자화한다", () => {
    expect(quantizeToFixedPoint(2.0, QFormat.Q23)).toBe(16777216);
  });
});
