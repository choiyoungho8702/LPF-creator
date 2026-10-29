export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export interface LowpassBiquadInput {
  sampleRate: number;
  cutoffFrequency: number;
  q: number;
}

/**
 * RBJ Audio EQ Cookbook 2차 저역통과 Biquad 공식. a0으로 정규화해 a0=1을 전제로
 * b0/b1/b2/a1/a2만 반환한다.
 */
export function calculateLowpassBiquad({
  sampleRate,
  cutoffFrequency,
  q,
}: LowpassBiquadInput): BiquadCoefficients {
  const w0 = (2 * Math.PI * cutoffFrequency) / sampleRate;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * q);

  const a0 = 1 + alpha;
  const b0 = (1 - cosw0) / 2;
  const b1 = 1 - cosw0;
  const b2 = (1 - cosw0) / 2;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}
