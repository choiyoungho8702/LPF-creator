import { describe, expect, it } from "vitest";

import { computeSpectrogram } from "@/lib/spectrogram";

describe("computeSpectrogram", () => {
  it("DC(상수) 신호는 모든 프레임에서 0번 bin(DC)이 가장 크다", () => {
    const samples = new Float32Array(4096).fill(0.5);
    const result = computeSpectrogram(samples, 44100, { windowSize: 256, hopSize: 128 });

    expect(result.frameCount).toBeGreaterThan(0);
    for (let frame = 0; frame < result.frameCount; frame++) {
      const row = result.magnitudesDb[frame];
      const dcValue = row[0];
      const maxOther = Math.max(...Array.from(row).slice(1));
      expect(dcValue).toBeGreaterThan(maxOther);
    }
  });

  it("앞부분은 무음, 뒷부분은 톤인 신호는 시간에 따라 에너지 위치가 달라진다", () => {
    const sampleRate = 8000;
    const windowSize = 256;
    const hopSize = 128;
    const totalSamples = windowSize * 20;
    const samples = new Float32Array(totalSamples);
    const toneFreq = 1000;
    // 뒷절반에만 톤을 채운다.
    for (let n = Math.floor(totalSamples / 2); n < totalSamples; n++) {
      samples[n] = Math.sin((2 * Math.PI * toneFreq * n) / sampleRate);
    }

    const result = computeSpectrogram(samples, sampleRate, { windowSize, hopSize });
    const toneBin = Math.round((toneFreq * windowSize) / sampleRate);

    const firstFrameEnergy = result.magnitudesDb[0][toneBin];
    const lastFrameEnergy = result.magnitudesDb[result.frameCount - 1][toneBin];

    expect(lastFrameEnergy).toBeGreaterThan(firstFrameEnergy + 20);
  });
});
