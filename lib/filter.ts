import type { BiquadCoefficients } from "@/lib/biquad";

/** Direct Form I 2차 Biquad를 샘플 배열 전체에 적용한다 (a0=1 전제). */
export function applyBiquad(
  samples: ArrayLike<number>,
  { b0, b1, b2, a1, a2 }: BiquadCoefficients,
): Float32Array {
  const output = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let n = 0; n < samples.length; n++) {
    const x0 = samples[n];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    output[n] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return output;
}

/** 여러 Biquad 섹션을 순서대로 cascade 적용한다(이전 섹션의 출력이 다음 섹션의 입력). */
export function applyBiquadCascade(
  samples: ArrayLike<number>,
  sections: BiquadCoefficients[],
): Float32Array {
  return sections.reduce<ArrayLike<number>>(
    (current, section) => applyBiquad(current, section),
    samples,
  ) as Float32Array;
}
