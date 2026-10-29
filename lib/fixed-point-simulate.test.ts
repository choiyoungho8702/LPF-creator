import { describe, expect, it } from "vitest";

import { simulateFixedPointBiquadCascade } from "@/lib/fixed-point-simulate";
import { QFormat } from "@/lib/fixed-point";

describe("simulateFixedPointBiquadCascade", () => {
  it("정상 범위 내 신호는 overflow 없이 처리된다", () => {
    // b0=0.5, 나머지 0 → 단순 감쇠. 0.9 입력은 Q15로 변환해도 overflow가 없다.
    const sections = [{ b0: 0.5, b1: 0, b2: 0, a1: 0, a2: 0 }];
    const { overflowDetected } = simulateFixedPointBiquadCascade([0.9, 0.9], sections, QFormat.Q15);

    expect(overflowDetected).toBe(false);
  });

  it("불안정한 피드백(|a1|>1)으로 신호가 기하급수적으로 커지면 overflow를 감지하고 saturate한다", () => {
    // b0=1.0(Q15 표현 한계로 32767=0.99997로 양자화), a1=-1.9(Q13 피드백 포맷).
    // 독립적으로 BigInt 산술로 직접 계산해 검증한 시나리오(node -e 스크립트):
    // n=0: y=16383(overflow 없음), n=1: y_raw=47512 → 32767로 saturate, overflow 발생.
    const sections = [{ b0: 1.0, b1: 0, b2: 0, a1: -1.9, a2: 0 }];
    const { output, overflowDetected } = simulateFixedPointBiquadCascade(
      [0.5, 0.5],
      sections,
      QFormat.Q15,
    );

    expect(overflowDetected).toBe(true);
    expect(Array.from(output)).toEqual([16383 / 32768, 32767 / 32768]);
  });
});
