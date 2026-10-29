import { describe, expect, it } from "vitest";

import { logFrequencyPosition } from "@/lib/chart-scale";

describe("logFrequencyPosition", () => {
  it("최소 주파수는 0, 최대 주파수는 1을 반환한다", () => {
    expect(logFrequencyPosition(20, 20, 20000)).toBeCloseTo(0, 10);
    expect(logFrequencyPosition(20000, 20, 20000)).toBeCloseTo(1, 10);
  });

  it("기하평균 지점은 0.5를 반환한다(로그 스케일의 중간)", () => {
    const geometricMean = Math.sqrt(20 * 20000);
    expect(logFrequencyPosition(geometricMean, 20, 20000)).toBeCloseTo(0.5, 10);
  });

  it("범위를 벗어나는 값은 0~1로 clamp된다", () => {
    expect(logFrequencyPosition(1, 20, 20000)).toBe(0);
    expect(logFrequencyPosition(100000, 20, 20000)).toBe(1);
  });
});
