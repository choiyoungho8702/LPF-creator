export interface FlacHeader {
  sampleRate: number;
  bitDepth: number;
  channels: number;
}

function readBits(bytes: Uint8Array, bitOffset: number, bitLength: number): number {
  let result = 0;
  for (let i = 0; i < bitLength; i++) {
    const absoluteBit = bitOffset + i;
    const byte = bytes[absoluteBit >> 3];
    const bit = (byte >> (7 - (absoluteBit % 8))) & 1;
    result = result * 2 + bit;
  }
  return result;
}

export function parseFlacHeader(buffer: ArrayBuffer): FlacHeader {
  const bytes = new Uint8Array(buffer);

  // STREAMINFO data starts at file offset 8 (after "fLaC" and the metadata
  // block header). The sampleRate/channels/bitsPerSample/totalSamples group
  // starts 10 bytes into STREAMINFO, i.e. file offset 18.
  const packedStart = 18 * 8;
  const sampleRate = readBits(bytes, packedStart, 20);
  const channels = readBits(bytes, packedStart + 20, 3) + 1;
  const bitDepth = readBits(bytes, packedStart + 23, 5) + 1;

  return { sampleRate, bitDepth, channels };
}
