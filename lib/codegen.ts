import type { BiquadCoefficients } from "@/lib/biquad";

export interface FloatBiquadCodegenInput {
  sections: BiquadCoefficients[];
  blockSize: number;
}

function formatFloat(value: number): string {
  return `${value.toFixed(9)}f`;
}

/**
 * Biquad cascade를 Direct Form II Transposed 구조의 float C 코드로 생성한다.
 * 섹션 수와 무관하게 하나의 루프 템플릿을 쓰고, 계수 테이블만 채워 넣는다.
 */
export function generateFloatBiquadCCode({ sections, blockSize }: FloatBiquadCodegenInput): string {
  const coefficientRows = sections
    .map(
      ({ b0, b1, b2, a1, a2 }) =>
        `    { ${formatFloat(b0)}, ${formatFloat(b1)}, ${formatFloat(b2)}, ${formatFloat(a1)}, ${formatFloat(a2)} },`,
    )
    .join("\n");

  return `#define LPF_NUM_SECTIONS ${sections.length}
#define LPF_BLOCK_SIZE ${blockSize}

typedef struct {
    float b0, b1, b2, a1, a2;
} LpfSection;

static const LpfSection lpf_sections[LPF_NUM_SECTIONS] = {
${coefficientRows}
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
`;
}
