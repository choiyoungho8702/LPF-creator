export interface QFormatSpec {
  totalBits: 16 | 32;
  fractionalBits: number;
}

/** 스펙에서 선택 가능한 Q-Format: Q15=16비트 컨테이너, Q23/Q31=32비트 컨테이너. */
export const QFormat: Record<"Q15" | "Q23" | "Q31", QFormatSpec> = {
  Q15: { totalBits: 16, fractionalBits: 15 },
  Q23: { totalBits: 32, fractionalBits: 23 },
  Q31: { totalBits: 32, fractionalBits: 31 },
};

/**
 * 실수 값을 지정된 Q-Format의 정수로 양자화한다. 표현 범위를 벗어나면
 * saturate(잘라내기)한다.
 */
export function quantizeToFixedPoint(value: number, { totalBits, fractionalBits }: QFormatSpec): number {
  const max = 2 ** (totalBits - 1) - 1;
  const min = -(2 ** (totalBits - 1));
  const scaled = Math.round(value * 2 ** fractionalBits);
  return Math.max(min, Math.min(max, scaled));
}
