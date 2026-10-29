import type { BiquadCoefficients } from "@/lib/biquad";
import { quantizeToFixedPoint, type QFormatSpec } from "@/lib/fixed-point";

export interface FixedPointBiquadCodegenInput {
  sections: BiquadCoefficients[];
  blockSize: number;
  qFormat: QFormatSpec;
}

/**
 * Biquad 피드백 계수(a1, a2)는 안정한 2차 섹션에서도 절댓값이 1.0을 넘을 수
 * 있어(이론상 |a1|<2, |a2|<1), 정수부에 2비트 여유를 더 둔 포맷으로 따로
 * 양자화한다. 그렇지 않으면 사용자가 고른 Q-Format 범위(-1~1 근방)를 넘는
 * 계수가 saturate되어 실제 값과 다른, 잘못된 필터가 된다.
 */
const FEEDBACK_HEADROOM_BITS = 2;

/**
 * Biquad cascade를 정수 연산 + 비트 시프트(>>) + 포화 연산을 쓰는
 * Direct Form II Transposed C 코드로 생성한다.
 */
export function generateFixedPointBiquadCCode({
  sections,
  blockSize,
  qFormat,
}: FixedPointBiquadCodegenInput): string {
  const { totalBits, fractionalBits } = qFormat;
  const feedbackFormat: QFormatSpec = {
    totalBits,
    fractionalBits: fractionalBits - FEEDBACK_HEADROOM_BITS,
  };
  const sampleMax = 2 ** (totalBits - 1) - 1;
  const sampleMin = -(2 ** (totalBits - 1));

  const coefficientRows = sections
    .map(({ b0, b1, b2, a1, a2 }) => {
      const qb = (value: number) => quantizeToFixedPoint(value, qFormat);
      const qa = (value: number) => quantizeToFixedPoint(value, feedbackFormat);
      return `    { ${qb(b0)}, ${qb(b1)}, ${qb(b2)}, ${qa(a1)}, ${qa(a2)} },`;
    })
    .join("\n");

  return `#include <stdint.h>

#define LPF_NUM_SECTIONS ${sections.length}
#define LPF_BLOCK_SIZE ${blockSize}
#define LPF_Q_SHIFT ${fractionalBits}
#define LPF_A_SHIFT ${feedbackFormat.fractionalBits}
#define LPF_SAMPLE_MAX ${sampleMax}
#define LPF_SAMPLE_MIN ${sampleMin}

typedef struct {
    int32_t b0, b1, b2, a1, a2;
} LpfSection;

// a1, a2는 Biquad 피드백 계수가 1.0을 넘을 수 있어(최대 2에 근접) 오버플로우를
// 피하기 위해 정수부 2비트 여유를 더 둔 포맷(LPF_A_SHIFT)으로 양자화한다.
static const LpfSection lpf_sections[LPF_NUM_SECTIONS] = {
${coefficientRows}
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
`;
}
