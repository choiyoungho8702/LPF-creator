import { describe, expect, it } from "vitest";

import { butterworthSectionQs, designButterworthLowpass } from "@/lib/butterworth";
import { calculateLowpassBiquad } from "@/lib/biquad";

// 참조값: 표준 Butterworth 극점 Q 공식 Q_k = 1 / (2*sin((2k-1)*pi/(2N))), k=1..N/2
// 을 독립적으로 계산한 결과(구현과 별개로 node -e 스크립트로 검증).
describe("butterworthSectionQs", () => {
  it("2차 Butterworth는 Biquad 1개, Q=1/sqrt(2)를 반환한다", () => {
    const qs = butterworthSectionQs(2);
    expect(qs.length).toBe(1);
    expect(qs[0]).toBeCloseTo(0.7071067811865476, 12);
  });

  it("4차 Butterworth는 Biquad 2개의 Q를 반환한다", () => {
    const qs = butterworthSectionQs(4);
    expect(qs.length).toBe(2);
    expect(qs[0]).toBeCloseTo(1.3065629648763766, 12);
    expect(qs[1]).toBeCloseTo(0.541196100146197, 12);
  });

  it("8차 Butterworth는 Biquad 4개의 Q를 반환한다", () => {
    const qs = butterworthSectionQs(8);
    expect(qs.length).toBe(4);
    expect(qs[0]).toBeCloseTo(2.5629154477415064, 12);
    expect(qs[1]).toBeCloseTo(0.8999762231364158, 12);
    expect(qs[2]).toBeCloseTo(0.6013448869350453, 12);
    expect(qs[3]).toBeCloseTo(0.5097955791041592, 12);
  });
});

describe("designButterworthLowpass", () => {
  it("각 섹션의 Q로 계산한 Biquad 계수 cascade를 order 수에 맞는 섹션 수만큼 반환한다", () => {
    const sampleRate = 48000;
    const cutoffFrequency = 1000;
    const order = 4;

    const sections = designButterworthLowpass({ sampleRate, cutoffFrequency, order });
    const expectedQs = butterworthSectionQs(order);

    expect(sections.length).toBe(order / 2);
    sections.forEach((section, i) => {
      const expected = calculateLowpassBiquad({ sampleRate, cutoffFrequency, q: expectedQs[i] });
      expect(section).toEqual(expected);
    });
  });
});
