import { calculateLowpassBiquad, type BiquadCoefficients } from "@/lib/biquad";

/**
 * N차 Butterworth 필터를 N/2개의 2차 Biquad 섹션으로 cascade할 때, 각 섹션에
 * 쓸 Q 값을 반환한다. 표준 극점 공식: Q_k = 1 / (2*sin((2k-1)*pi/(2N))), k=1..N/2.
 */
export function butterworthSectionQs(order: number): number[] {
  const sectionCount = order / 2;
  const qs: number[] = [];

  for (let k = 1; k <= sectionCount; k++) {
    const theta = ((2 * k - 1) * Math.PI) / (2 * order);
    qs.push(1 / (2 * Math.sin(theta)));
  }

  return qs;
}

export interface ButterworthLowpassInput {
  sampleRate: number;
  cutoffFrequency: number;
  order: number;
}

/** N차 Butterworth 저역통과 필터를 cascade biquad 섹션 배열로 설계한다. */
export function designButterworthLowpass({
  sampleRate,
  cutoffFrequency,
  order,
}: ButterworthLowpassInput): BiquadCoefficients[] {
  return butterworthSectionQs(order).map((q) =>
    calculateLowpassBiquad({ sampleRate, cutoffFrequency, q }),
  );
}
