import { describe, expect, it } from "vitest";

import { WAV_DATA_OFFSET, encodeWavFile, parseWavHeader } from "@/lib/wav";
import { decodePcmSamples } from "@/lib/pcm";

function buildCanonicalWavBuffer({
  sampleRate,
  bitDepth,
  channels,
}: {
  sampleRate: number;
  bitDepth: number;
  channels: number;
}): ArrayBuffer {
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const dataSize = 0;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
    offset += s.length;
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); // Subchunk1Size
  offset += 4;
  view.setUint16(offset, 1, true); // AudioFormat: PCM
  offset += 2;
  view.setUint16(offset, channels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bitDepth, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  return buffer;
}

describe("parseWavHeader", () => {
  it("44.1kHz/16비트/스테레오 PCM WAV 헤더에서 샘플링 레이트·비트 뎁스·채널 수를 추출한다", () => {
    const buffer = buildCanonicalWavBuffer({
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
    });

    expect(parseWavHeader(buffer)).toEqual({
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
    });
  });
});

describe("encodeWavFile", () => {
  it("채널별 float 샘플을 16비트 PCM WAV로 인코딩하면 헤더와 데이터를 원래 값으로 복원할 수 있다", () => {
    const channelData = [
      new Float32Array([0.5, -0.5, 0]),
      new Float32Array([-0.25, 0.25, 0.1]),
    ];
    const sampleRate = 44100;
    const bitDepth = 16;

    const buffer = encodeWavFile(channelData, { sampleRate, bitDepth });

    expect(parseWavHeader(buffer)).toEqual({ sampleRate, bitDepth, channels: 2 });

    const decoded = decodePcmSamples(buffer.slice(WAV_DATA_OFFSET), {
      bitDepth,
      channels: 2,
    });

    decoded.forEach((channel, i) => {
      channel.forEach((value, j) => {
        // 16비트 양자화 오차(1/32768 수준) 범위 내에서 원래 값과 일치해야 한다.
        expect(value).toBeCloseTo(channelData[i][j], 3);
      });
    });
  });
});
