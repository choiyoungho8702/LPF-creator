import { describe, expect, it } from "vitest";

import { computeMaxAbsoluteError } from "@/lib/quantization-error";

describe("computeMaxAbsoluteError", () => {
  it("두 신호 사이의 최대 절댓값 오차를 반환한다", () => {
    const ideal = [0.5, -0.5, 0.1];
    const actual = [0.49, -0.52, 0.1];

    // |0.5-0.49|=0.01, |-0.5-(-0.52)|=0.02, |0.1-0.1|=0
    expect(computeMaxAbsoluteError(ideal, actual)).toBeCloseTo(0.02, 10);
  });
});
