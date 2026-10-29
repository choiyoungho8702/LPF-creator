import { describe, expect, it } from "vitest";

import { applyBiquad, applyBiquadCascade } from "@/lib/filter";
import type { BiquadCoefficients } from "@/lib/biquad";

describe("applyBiquad", () => {
  it("피드백이 없는 경우(a1=a2=0) 단순 FIR처럼 동작한다", () => {
    // y[n] = 0.5*x[n] + 0.5*x[n-1]
    const coefficients: BiquadCoefficients = { b0: 0.5, b1: 0.5, b2: 0, a1: 0, a2: 0 };
    const impulse = [1, 0, 0, 0];

    expect(Array.from(applyBiquad(impulse, coefficients))).toEqual([0.5, 0.5, 0, 0]);
  });

  it("피드백이 있는 경우(a1=-0.5) 이전 출력을 절반씩 반영해 지수적으로 감쇠한다", () => {
    // y[n] = x[n] + 0.5*y[n-1]
    const coefficients: BiquadCoefficients = { b0: 1, b1: 0, b2: 0, a1: -0.5, a2: 0 };
    const impulse = [1, 0, 0, 0];

    expect(Array.from(applyBiquad(impulse, coefficients))).toEqual([1, 0.5, 0.25, 0.125]);
  });
});

describe("applyBiquadCascade", () => {
  it("섹션이 1개면 applyBiquad를 한 번 적용한 것과 같다", () => {
    const coefficients: BiquadCoefficients = { b0: 0.5, b1: 0.5, b2: 0, a1: 0, a2: 0 };
    const impulse = [1, 0, 0, 0];

    expect(Array.from(applyBiquadCascade(impulse, [coefficients]))).toEqual(
      Array.from(applyBiquad(impulse, coefficients)),
    );
  });

  it("섹션이 2개면 같은 필터를 두 번 연속 적용한 것과 같다", () => {
    const coefficients: BiquadCoefficients = { b0: 0.5, b1: 0.5, b2: 0, a1: 0, a2: 0 };
    const impulse = [1, 0, 0, 0];

    const expected = applyBiquad(applyBiquad(impulse, coefficients), coefficients);

    expect(Array.from(applyBiquadCascade(impulse, [coefficients, coefficients]))).toEqual(
      Array.from(expected),
    );
  });
});
