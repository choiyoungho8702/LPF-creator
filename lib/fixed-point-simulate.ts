import type { BiquadCoefficients } from "@/lib/biquad";
import { quantizeToFixedPoint, type QFormatSpec } from "@/lib/fixed-point";

const FEEDBACK_HEADROOM_BITS = 2;

export interface FixedPointSimulationResult {
  output: Float32Array;
  overflowDetected: boolean;
}

/**
 * lib/codegen-fixed.ts가 생성하는 C 코드(Direct Form II Transposed, 정수 +
 * 비트 시프트 + 포화 연산)와 동일한 산술을 BigInt로 그대로 수행해, 생성될
 * 하드웨어 코드가 실제로 어떻게 동작할지(오버플로우 여부 포함) 시뮬레이션한다.
 */
export function simulateFixedPointBiquadCascade(
  samples: ArrayLike<number>,
  sections: BiquadCoefficients[],
  qFormat: QFormatSpec,
): FixedPointSimulationResult {
  const feedbackFormat: QFormatSpec = {
    totalBits: qFormat.totalBits,
    fractionalBits: qFormat.fractionalBits - FEEDBACK_HEADROOM_BITS,
  };
  const sampleMax = BigInt(2 ** (qFormat.totalBits - 1) - 1);
  const sampleMin = BigInt(-(2 ** (qFormat.totalBits - 1)));
  const maxMagnitude = 2 ** (qFormat.totalBits - 1);
  const bShift = BigInt(qFormat.fractionalBits);
  const aShift = BigInt(feedbackFormat.fractionalBits);

  const quantizedSections = sections.map(({ b0, b1, b2, a1, a2 }) => ({
    b0: BigInt(quantizeToFixedPoint(b0, qFormat)),
    b1: BigInt(quantizeToFixedPoint(b1, qFormat)),
    b2: BigInt(quantizeToFixedPoint(b2, qFormat)),
    a1: BigInt(quantizeToFixedPoint(a1, feedbackFormat)),
    a2: BigInt(quantizeToFixedPoint(a2, feedbackFormat)),
  }));

  const state = sections.map(() => [BigInt(0), BigInt(0)] as [bigint, bigint]);
  const output = new Float32Array(samples.length);
  let overflowDetected = false;

  for (let n = 0; n < samples.length; n++) {
    let x = BigInt(quantizeToFixedPoint(samples[n], qFormat));

    for (let s = 0; s < quantizedSections.length; s++) {
      const { b0, b1, b2, a1, a2 } = quantizedSections[s];
      const [s1, s2] = state[s];

      const yRaw = (b0 * x >> bShift) + s1;
      let y: bigint;
      if (yRaw > sampleMax) {
        y = sampleMax;
        overflowDetected = true;
      } else if (yRaw < sampleMin) {
        y = sampleMin;
        overflowDetected = true;
      } else {
        y = yRaw;
      }

      state[s] = [(b1 * x >> bShift) - (a1 * y >> aShift) + s2, (b2 * x >> bShift) - (a2 * y >> aShift)];
      x = y;
    }

    output[n] = Number(x) / maxMagnitude;
  }

  return { output, overflowDetected };
}
