import { fft } from "@/lib/fft";

export interface SpectrogramOptions {
  windowSize: number;
  hopSize: number;
}

export interface SpectrogramResult {
  frameCount: number;
  frequencyBinCount: number;
  /** [frame][bin], dB. */
  magnitudesDb: Float32Array[];
  sampleRate: number;
  windowSize: number;
  hopSize: number;
}

function hannWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let n = 0; n < size; n++) {
    window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (size - 1));
  }
  return window;
}

/**
 * 시간에 따른 주파수 분포(스펙트로그램)를 STFT(구간별 FFT)로 계산한다.
 * 음악처럼 시간에 따라 내용이 바뀌는 음원은 전체 구간을 하나로 합친 스펙트럼보다
 * 이 쪽이 LPF 효과를 훨씬 명확하게 보여준다.
 */
export function computeSpectrogram(
  samples: ArrayLike<number>,
  sampleRate: number,
  { windowSize, hopSize }: SpectrogramOptions,
): SpectrogramResult {
  const window = hannWindow(windowSize);
  const frameCount = Math.max(0, Math.floor((samples.length - windowSize) / hopSize) + 1);
  const frequencyBinCount = windowSize / 2;
  const magnitudesDb: Float32Array[] = [];

  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * hopSize;
    const real = new Float64Array(windowSize);
    const imag = new Float64Array(windowSize);
    for (let n = 0; n < windowSize; n++) {
      real[n] = samples[start + n] * window[n];
    }

    fft(real, imag);

    const row = new Float32Array(frequencyBinCount);
    for (let bin = 0; bin < frequencyBinCount; bin++) {
      const magnitude = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]);
      row[bin] = 20 * Math.log10(Math.max(magnitude, 1e-6));
    }
    magnitudesDb.push(row);
  }

  return { frameCount, frequencyBinCount, magnitudesDb, sampleRate, windowSize, hopSize };
}
