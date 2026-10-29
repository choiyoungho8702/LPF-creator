import { describe, expect, it } from "vitest";

import { computeMagnitudeSpectrum } from "@/lib/fft";

describe("computeMagnitudeSpectrum", () => {
  it("단위 임펄스의 크기 스펙트럼은 모든 주파수에서 평탄하다(값=1)", () => {
    const impulse = [1, 0, 0, 0, 0, 0, 0, 0];
    const magnitude = Array.from(computeMagnitudeSpectrum(impulse));

    magnitude.forEach((value) => expect(value).toBeCloseTo(1, 10));
    expect(magnitude.length).toBe(4); // N/2 (양의 주파수만)
  });

  it("DC(상수) 신호의 크기 스펙트럼은 0번 bin에만 에너지가 몰린다", () => {
    const dc = [1, 1, 1, 1, 1, 1, 1, 1];
    const magnitude = Array.from(computeMagnitudeSpectrum(dc));

    expect(magnitude[0]).toBeCloseTo(8, 10);
    for (let i = 1; i < magnitude.length; i++) {
      expect(magnitude[i]).toBeCloseTo(0, 10);
    }
  });
});
