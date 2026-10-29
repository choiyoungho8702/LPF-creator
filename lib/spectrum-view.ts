/**
 * 스펙트럼 표시 전, 필터가 0 상태에서 시작하며 생기는 "시작 과도응답" 구간을
 * 잘라낸다. 이 구간은 실제 신호가 아니라 필터가 안정되기 전의 일시적 인공물이라,
 * 분석 구간 길이와 무관하게 스펙트럼 전체에 걸쳐 같은 크기로 나타난다 — 길게
 * 녹음해도 저절로 사라지지 않는다.
 */
export function trimSettlingTime(
  samples: ArrayLike<number>,
  sampleRate: number,
  seconds = 0.1,
): Float32Array {
  const requested = Math.floor(sampleRate * seconds);
  const skipCount = Math.min(requested, Math.floor(samples.length / 2));
  return Float32Array.from(samples).subarray(skipCount);
}
