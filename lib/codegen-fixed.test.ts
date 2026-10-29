import { describe, expect, it } from "vitest";

import { generateFixedPointBiquadCCode } from "@/lib/codegen-fixed";
import { QFormat } from "@/lib/fixed-point";

describe("generateFixedPointBiquadCCode", () => {
  it("Q15 정수 + 비트 시프트 + 포화 연산을 쓰는 Direct Form II Transposed C 코드를 생성한다", () => {
    const sections = [{ b0: 0.5, b1: 0.25, b2: 0, a1: -0.5, a2: 0 }];

    const code = generateFixedPointBiquadCCode({
      sections,
      blockSize: 8,
      qFormat: QFormat.Q15,
    });

    expect(code).toBe(`#include <stdint.h>

#define LPF_NUM_SECTIONS 1
#define LPF_BLOCK_SIZE 8
#define LPF_Q_SHIFT 15
#define LPF_A_SHIFT 13
#define LPF_SAMPLE_MAX 32767
#define LPF_SAMPLE_MIN -32768

typedef struct {
    int32_t b0, b1, b2, a1, a2;
} LpfSection;

// a1, a2는 Biquad 피드백 계수가 1.0을 넘을 수 있어(최대 2에 근접) 오버플로우를
// 피하기 위해 정수부 2비트 여유를 더 둔 포맷(LPF_A_SHIFT)으로 양자화한다.
static const LpfSection lpf_sections[LPF_NUM_SECTIONS] = {
    { 16384, 8192, 0, -4096, 0 },
};

static int32_t lpf_state[LPF_NUM_SECTIONS][2] = {0};

static int32_t lpf_saturate(int64_t value) {
    if (value > LPF_SAMPLE_MAX) return LPF_SAMPLE_MAX;
    if (value < LPF_SAMPLE_MIN) return LPF_SAMPLE_MIN;
    return (int32_t)value;
}

void lpf_process_block(const int32_t *input, int32_t *output) {
    for (int n = 0; n < LPF_BLOCK_SIZE; n++) {
        int32_t x = input[n];
        for (int s = 0; s < LPF_NUM_SECTIONS; s++) {
            int64_t y_raw = ((int64_t)lpf_sections[s].b0 * x >> LPF_Q_SHIFT) + lpf_state[s][0];
            int32_t y = lpf_saturate(y_raw);
            lpf_state[s][0] = (int32_t)(((int64_t)lpf_sections[s].b1 * x >> LPF_Q_SHIFT) - ((int64_t)lpf_sections[s].a1 * y >> LPF_A_SHIFT) + lpf_state[s][1]);
            lpf_state[s][1] = (int32_t)(((int64_t)lpf_sections[s].b2 * x >> LPF_Q_SHIFT) - ((int64_t)lpf_sections[s].a2 * y >> LPF_A_SHIFT));
            x = y;
        }
        output[n] = x;
    }
}
`);
  });

  it("Butterworth 2차 섹션처럼 |a1|>1인 계수도 saturate되지 않고 정확히 양자화된다", () => {
    // Fs=48000, Fc=1000, Q=1/sqrt(2) 섹션 (lib/biquad.test.ts에서 검증된 값). a1 ≈ -1.815.
    const sections = [
      {
        b0: 0.003916126660547383,
        b1: 0.007832253321094766,
        b2: 0.003916126660547383,
        a1: -1.815341082704568,
        a2: 0.8310055893467576,
      },
    ];

    const code = generateFixedPointBiquadCCode({
      sections,
      blockSize: 32,
      qFormat: QFormat.Q15,
    });

    // a1 = -1.815341082704568 * 2^13 (node -e로 독립 계산) = -14871. 2^15가 아닌
    // 2^13으로 스케일되므로 saturate되지 않고 실제 값을 보존해야 한다.
    const coefficientRow = code.split("\n").find((line) => line.trim().startsWith("{"));
    expect(coefficientRow).toContain("-14871");
    expect(coefficientRow).not.toContain("-32768");
  });
});
