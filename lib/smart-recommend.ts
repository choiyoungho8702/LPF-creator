import { computeMagnitudeSpectrum } from "@/lib/fft";

/** 피크 대비 이 비율(약 -60dB) 아래로 떨어지면 "사실상 에너지가 사라졌다"고 본다. */
const EFFECTIVE_ENERGY_THRESHOLD_RATIO = 0.001;

/**
 * 오디오 신호의 스펙트럼을 분석해, 실제 오디오 성분이 사실상 사라지는
 * '최대 유효 주파수'를 찾아 추천 Fc로 반환한다. 피크 대비 -60dB 아래로
 * 떨어지는 지점을 넘어서는 고주파 구간이 더 올라가면, 그 바로 아래 유효
 * 구간의 최고 주파수를 추천한다.
 */
export function recommendCutoffFrequency(samples: ArrayLike<number>, sampleRate: number): number {
  // 윈도우 없이 FFT하면 스펙트럼 누설(spectral leakage)로 실제보다 높은 주파수까지
  // 에너지가 있는 것처럼 보여 추천값이 부풀려진다. Hann window로 누설을 줄인다.
  const windowed = new Float64Array(samples.length);
  for (let n = 0; n < samples.length; n++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (samples.length - 1));
    windowed[n] = samples[n] * hann;
  }

  const magnitude = computeMagnitudeSpectrum(windowed);
  const peak = Math.max(...magnitude);
  const threshold = peak * EFFECTIVE_ENERGY_THRESHOLD_RATIO;
  const binHz = sampleRate / (magnitude.length * 2);

  let lastEffectiveBin = 0;
  for (let i = 0; i < magnitude.length; i++) {
    if (magnitude[i] > threshold) lastEffectiveBin = i;
  }

  const nyquist = sampleRate / 2;
  const recommended = (lastEffectiveBin + 1) * binHz;
  return Math.min(recommended, nyquist * 0.99);
}
