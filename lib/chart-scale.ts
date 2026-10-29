/**
 * 주파수를 로그 스케일에서 0~1 사이 위치로 변환한다. 오디오 스펙트럼은
 * 보통 저주파 구간에 의미 있는 내용이 몰려 있어, 선형 스케일에서는 대부분의
 * 폭이 밋밋한 직선처럼 보인다. 로그 스케일이 해상도를 고르게 분배한다.
 */
export function logFrequencyPosition(frequency: number, minFrequency: number, maxFrequency: number): number {
  const clamped = Math.max(minFrequency, Math.min(maxFrequency, frequency));
  return (Math.log10(clamped) - Math.log10(minFrequency)) / (Math.log10(maxFrequency) - Math.log10(minFrequency));
}

const NICE_FREQUENCY_CANDIDATES = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

/** [minFrequency, maxFrequency] 범위 안에 들어오는 보기 좋은 로그 눈금 주파수를 고른다. */
export function niceFrequencyTicks(minFrequency: number, maxFrequency: number): number[] {
  return NICE_FREQUENCY_CANDIDATES.filter((f) => f >= minFrequency && f <= maxFrequency);
}

/** 1000 이상은 "1k" 식으로, 그 미만은 그대로 표기한다. */
export function formatFrequencyLabel(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000}k` : `${frequency}`;
}
