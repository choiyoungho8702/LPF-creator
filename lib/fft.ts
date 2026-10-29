/** Cooley-Tukey radix-2 FFT. real/imag는 길이가 2의 거듭제곱이어야 하며 제자리에서 변환한다. */
export function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curWr = 1;
      let curWi = 0;

      for (let j = 0; j < len / 2; j++) {
        const ur = real[i + j];
        const ui = imag[i + j];
        const vr = real[i + j + len / 2] * curWr - imag[i + j + len / 2] * curWi;
        const vi = real[i + j + len / 2] * curWi + imag[i + j + len / 2] * curWr;

        real[i + j] = ur + vr;
        imag[i + j] = ui + vi;
        real[i + j + len / 2] = ur - vr;
        imag[i + j + len / 2] = ui - vi;

        const nextWr = curWr * wr - curWi * wi;
        const nextWi = curWr * wi + curWi * wr;
        curWr = nextWr;
        curWi = nextWi;
      }
    }
  }
}

/** 샘플을 2의 거듭제곱 길이로 잘라 FFT를 수행하고, 양의 주파수 대역(N/2)의 크기 스펙트럼을 반환한다. */
export function computeMagnitudeSpectrum(samples: ArrayLike<number>): Float64Array {
  let n = 1;
  while (n * 2 <= samples.length) n *= 2;

  const real = new Float64Array(n);
  const imag = new Float64Array(n);
  for (let i = 0; i < n; i++) real[i] = samples[i];

  fft(real, imag);

  const half = n / 2;
  const magnitude = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }

  return magnitude;
}
