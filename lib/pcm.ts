export interface PcmFormat {
  bitDepth: 16 | 24;
  channels: number;
}

function readSignedSample(view: DataView, byteOffset: number, bytesPerSample: number): number {
  if (bytesPerSample === 2) {
    return view.getInt16(byteOffset, true);
  }

  // DataView has no native 24-bit accessor; read 3 little-endian bytes and
  // sign-extend manually.
  const value =
    view.getUint8(byteOffset) |
    (view.getUint8(byteOffset + 1) << 8) |
    (view.getUint8(byteOffset + 2) << 16);
  return value & 0x800000 ? value - 0x1000000 : value;
}

export function decodePcmSamples(buffer: ArrayBuffer, { bitDepth, channels }: PcmFormat): Float32Array[] {
  const view = new DataView(buffer);
  const bytesPerSample = bitDepth / 8;
  const maxMagnitude = 2 ** (bitDepth - 1);
  const frameCount = buffer.byteLength / (bytesPerSample * channels);
  const channelData: Float32Array[] = Array.from(
    { length: channels },
    () => new Float32Array(frameCount),
  );

  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const byteOffset = (frame * channels + channel) * bytesPerSample;
      channelData[channel][frame] = readSignedSample(view, byteOffset, bytesPerSample) / maxMagnitude;
    }
  }

  return channelData;
}
