import { describe, expect, it } from "vitest";

import { parseFlacHeader } from "@/lib/flac";

function buildFlacStreamInfoBuffer({
  sampleRate,
  bitDepth,
  channels,
}: {
  sampleRate: number;
  bitDepth: number;
  channels: number;
}): ArrayBuffer {
  // "fLaC"(4) + metadata block header(4) + STREAMINFO(34) = 42 bytes
  const buffer = new ArrayBuffer(42);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
    offset += s.length;
  };

  writeString("fLaC");

  // metadata block header: last-block flag = 1, block type = 0 (STREAMINFO), length = 34
  view.setUint8(offset, 0x80);
  offset += 1;
  view.setUint8(offset, 0x00);
  offset += 1;
  view.setUint8(offset, 0x00);
  offset += 1;
  view.setUint8(offset, 34);
  offset += 1;

  // min/max blocksize, min/max framesize: not used by the parser, left as zero
  offset += 2 + 2 + 3 + 3;

  // packed 64-bit group: sampleRate(20) | channels-1(3) | bitsPerSample-1(5) | totalSamples(36, set to 0)
  const packed =
    sampleRate * 2 ** 12 + (channels - 1) * 2 ** 9 + (bitDepth - 1) * 2 ** 4;
  view.setUint32(offset, packed, false);
  offset += 4;
  view.setUint32(offset, 0, false); // remaining bits of totalSamples
  offset += 4;

  // MD5 signature: not used by the parser, left as zero
  offset += 16;

  return buffer;
}

describe("parseFlacHeader", () => {
  it("44.1kHz/16비트/스테레오 FLAC STREAMINFO에서 샘플링 레이트·비트 뎁스·채널 수를 추출한다", () => {
    const buffer = buildFlacStreamInfoBuffer({
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
    });

    expect(parseFlacHeader(buffer)).toEqual({
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
    });
  });
});
