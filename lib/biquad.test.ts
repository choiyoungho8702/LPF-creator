import { describe, expect, it } from "vitest";

import { calculateLowpassBiquad } from "@/lib/biquad";

describe("calculateLowpassBiquad", () => {
  it("RBJ Audio EQ Cookbook 공식대로 2차 저역통과 Biquad 계수를 계산한다 (Fs=48000, Fc=1000, Q=1/sqrt(2))", () => {
    // 참조값: RBJ Audio EQ Cookbook LPF 공식을 독립적으로 계산한 결과(node -e로 별도 계산, 구현과 무관하게 검증).
    const coefficients = calculateLowpassBiquad({
      sampleRate: 48000,
      cutoffFrequency: 1000,
      q: 1 / Math.sqrt(2),
    });

    expect(coefficients.b0).toBeCloseTo(0.003916126660547383, 12);
    expect(coefficients.b1).toBeCloseTo(0.007832253321094766, 12);
    expect(coefficients.b2).toBeCloseTo(0.003916126660547383, 12);
    expect(coefficients.a1).toBeCloseTo(-1.815341082704568, 12);
    expect(coefficients.a2).toBeCloseTo(0.8310055893467576, 12);
  });
});
