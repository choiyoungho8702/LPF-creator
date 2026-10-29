/** 이상적인 float 결과와 실제(정수 고정소수점) 결과 사이의 최대 절댓값 오차를 계산한다. */
export function computeMaxAbsoluteError(ideal: ArrayLike<number>, actual: ArrayLike<number>): number {
  let max = 0;
  for (let i = 0; i < ideal.length; i++) {
    const error = Math.abs(ideal[i] - actual[i]);
    if (error > max) max = error;
  }
  return max;
}
