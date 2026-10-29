import { describe, expect, it } from "vitest";

import { generateFloatBiquadCCode } from "@/lib/codegen";

describe("generateFloatBiquadCCode", () => {
  it("Biquad 섹션들을 Direct Form II Transposed float 블록 처리 C 코드로 생성한다", () => {
    // 계수는 lib/biquad.test.ts에서 이미 검증한 Fs=48000, Fc=1000, Q=1/sqrt(2) 값.
    const sections = [
      {
        b0: 0.003916126660547383,
        b1: 0.007832253321094766,
        b2: 0.003916126660547383,
        a1: -1.815341082704568,
        a2: 0.8310055893467576,
      },
    ];

    const code = generateFloatBiquadCCode({ sections, blockSize: 4 });

    expect(code).toBe(`#define LPF_NUM_SECTIONS 1
#define LPF_BLOCK_SIZE 4

typedef struct {
    float b0, b1, b2, a1, a2;
} LpfSection;

static const LpfSection lpf_sections[LPF_NUM_SECTIONS] = {
    { 0.003916127f, 0.007832253f, 0.003916127f, -1.815341083f, 0.831005589f },
};

static float lpf_state[LPF_NUM_SECTIONS][2] = {0};

void lpf_process_block(const float *input, float *output) {
    for (int n = 0; n < LPF_BLOCK_SIZE; n++) {
        float x = input[n];
        for (int s = 0; s < LPF_NUM_SECTIONS; s++) {
            float y = lpf_sections[s].b0 * x + lpf_state[s][0];
            lpf_state[s][0] = lpf_sections[s].b1 * x - lpf_sections[s].a1 * y + lpf_state[s][1];
            lpf_state[s][1] = lpf_sections[s].b2 * x - lpf_sections[s].a2 * y;
            x = y;
        }
        output[n] = x;
    }
}
`);
  });
});
