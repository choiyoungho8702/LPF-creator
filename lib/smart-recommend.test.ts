import { describe, expect, it } from "vitest";

import { recommendCutoffFrequency } from "@/lib/smart-recommend";

describe("recommendCutoffFrequency", () => {
  it("1kHz와 5kHz 성분이 섞인 신호에서 5kHz 근처를 최대 유효 주파수로 추천한다", () => {
    const sampleRate = 44100;
    const length = 4096;
    const samples = new Float32Array(length);
    for (let n = 0; n < length; n++) {
      const t = n / sampleRate;
      samples[n] = 0.5 * Math.sin(2 * Math.PI * 1000 * t) + 0.5 * Math.sin(2 * Math.PI * 5000 * t);
    }

    const recommended = recommendCutoffFrequency(samples, sampleRate);

    // bin 해상도(Fs/N ≈ 10.77Hz)를 감안해 5000Hz 근방이면 통과.
    expect(recommended).toBeGreaterThan(4900);
    expect(recommended).toBeLessThan(5100);
  });

  it("무음 신호에서는 Nyquist 미만의 안전한 기본값을 반환한다", () => {
    const sampleRate = 44100;
    const samples = new Float32Array(4096);

    const recommended = recommendCutoffFrequency(samples, sampleRate);

    expect(recommended).toBeGreaterThan(0);
    expect(recommended).toBeLessThan(sampleRate / 2);
  });
});
