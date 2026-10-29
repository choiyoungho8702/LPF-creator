import { describe, expect, it } from "vitest";

import { trimSettlingTime } from "@/lib/spectrum-view";

describe("trimSettlingTime", () => {
  it("지정한 초만큼 앞부분을 잘라낸다", () => {
    const samples = new Float32Array(1000);
    const trimmed = trimSettlingTime(samples, 100, 0.1); // 100Hz * 0.1s = 10 샘플

    expect(trimmed.length).toBe(990);
  });

  it("잘라낼 길이가 전체의 절반을 넘으면 절반으로 제한한다", () => {
    const samples = new Float32Array(1000);
    const trimmed = trimSettlingTime(samples, 100, 1000); // 100000 샘플 요청 → 절반(500)으로 제한

    expect(trimmed.length).toBe(500);
  });
});
