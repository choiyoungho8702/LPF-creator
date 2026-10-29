export interface WavHeader {
  sampleRate: number;
  bitDepth: number;
  channels: number;
}

/** 표준 44바이트 PCM WAV 헤더 뒤, 오디오 데이터가 시작되는 바이트 오프셋. */
export const WAV_DATA_OFFSET = 44;

export function parseWavHeader(buffer: ArrayBuffer): WavHeader {
  const view = new DataView(buffer);

  return {
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitDepth: view.getUint16(34, true),
  };
}

export interface WavEncodeFormat {
  sampleRate: number;
  bitDepth: 16 | 24;
}

function writeSignedSample(view: DataView, byteOffset: number, bytesPerSample: number, value: number): void {
  if (bytesPerSample === 2) {
    view.setInt16(byteOffset, value, true);
    return;
  }

  // DataView has no native 24-bit accessor; write 3 little-endian bytes,
  // two's-complement encoding negative values manually.
  const unsigned = value < 0 ? value + 0x1000000 : value;
  view.setUint8(byteOffset, unsigned & 0xff);
  view.setUint8(byteOffset + 1, (unsigned >> 8) & 0xff);
  view.setUint8(byteOffset + 2, (unsigned >> 16) & 0xff);
}

/** 채널별 -1~1 정규화 float 샘플을 표준 16비트 PCM WAV 파일로 인코딩한다. */
export function encodeWavFile(channelData: Float32Array[], { sampleRate, bitDepth }: WavEncodeFormat): ArrayBuffer {
  const channels = channelData.length;
  const frameCount = channelData[0]?.length ?? 0;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;

  const buffer = new ArrayBuffer(WAV_DATA_OFFSET + dataSize);
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
  view.setUint32(offset, 16, true);
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

  const maxMagnitude = 2 ** (bitDepth - 1) - 1;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const clamped = Math.max(-1, Math.min(1, channelData[channel][frame]));
      writeSignedSample(view, offset, bytesPerSample, Math.round(clamped * maxMagnitude));
      offset += bytesPerSample;
    }
  }

  return buffer;
}
