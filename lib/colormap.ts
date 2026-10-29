type Rgb = [number, number, number];

/** Magma 계열 색상맵의 제어점(검정 -> 보라 -> 마젠타 -> 주황 -> 옅은 노랑). */
const STOPS: Rgb[] = [
  [0, 0, 4],
  [81, 18, 124],
  [183, 55, 121],
  [252, 137, 97],
  [252, 253, 191],
];

/** 0~1 사이 값을 magma 계열 색상(RGB)으로 매핑한다. 스펙트로그램 히트맵에 쓴다. */
export function magmaColor(t: number): Rgb {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (STOPS.length - 1);
  const index = Math.min(STOPS.length - 2, Math.floor(scaled));
  const localT = scaled - index;

  const [r0, g0, b0] = STOPS[index];
  const [r1, g1, b1] = STOPS[index + 1];

  return [
    Math.round(r0 + (r1 - r0) * localT),
    Math.round(g0 + (g1 - g0) * localT),
    Math.round(b0 + (b1 - b0) * localT),
  ];
}
