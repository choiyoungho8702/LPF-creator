import { describe, expect, it } from "vitest";

import { decodePcmSamples } from "@/lib/pcm";

function buildInt16Buffer(interleavedSamples: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(interleavedSamples.length * 2);
  const view = new DataView(buffer);
  interleavedSamples.forEach((sample, i) => view.setInt16(i * 2, sample, true));
  return buffer;
}

function buildInt24Buffer(samples: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 3);
  const view = new DataView(buffer);
  samples.forEach((sample, i) => {
    const value = sample < 0 ? sample + 0x1000000 : sample;
    const offset = i * 3;
    view.setUint8(offset, value & 0xff);
    view.setUint8(offset + 1, (value >> 8) & 0xff);
    view.setUint8(offset + 2, (value >> 16) & 0xff);
  });
  return buffer;
}

describe("decodePcmSamples", () => {
  it("16비트 스테레오 인터리브 PCM을 채널별 -1~1 정규화 샘플로 디코딩한다", () => {
    // 프레임: (L, R) x 3 = (1000, -1000), (16383, -16384), (0, 32767)
    const buffer = buildInt16Buffer([1000, -1000, 16383, -16384, 0, 32767]);

    const channels = decodePcmSamples(buffer, { bitDepth: 16, channels: 2 });

    expect(Array.from(channels[0])).toEqual([1000 / 32768, 16383 / 32768, 0]);
    expect(Array.from(channels[1])).toEqual([-1000 / 32768, -16384 / 32768, 32767 / 32768]);
  });

  it("24비트 모노 PCM을 -1~1 정규화 샘플로 디코딩한다(음수 부호 확장 포함)", () => {
    const buffer = buildInt24Buffer([1000000, -1000000, 8388607, -8388608, 0]);

    const channels = decodePcmSamples(buffer, { bitDepth: 24, channels: 1 });

    expect(Array.from(channels[0])).toEqual([
      1000000 / 8388608,
      -1000000 / 8388608,
      8388607 / 8388608,
      -1,
      0,
    ]);
  });
});
