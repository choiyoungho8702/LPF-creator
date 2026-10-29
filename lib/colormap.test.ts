import { describe, expect, it } from "vitest";

import { magmaColor } from "@/lib/colormap";

describe("magmaColor", () => {
  it("0은 어두운 색(거의 검정), 1은 밝은 색(거의 흰 노랑)을 반환한다", () => {
    const dark = magmaColor(0);
    const bright = magmaColor(1);

    const darkBrightness = dark[0] + dark[1] + dark[2];
    const brightBrightness = bright[0] + bright[1] + bright[2];

    expect(darkBrightness).toBeLessThan(50);
    expect(brightBrightness).toBeGreaterThan(600);
  });

  it("범위를 벗어난 값은 0~1로 clamp된다", () => {
    expect(magmaColor(-1)).toEqual(magmaColor(0));
    expect(magmaColor(2)).toEqual(magmaColor(1));
  });

  it("t가 커질수록 전체 밝기(RGB 합)가 단조 증가한다", () => {
    const samples = [0, 0.25, 0.5, 0.75, 1].map(magmaColor);
    const brightness = samples.map(([r, g, b]) => r + g + b);
    for (let i = 1; i < brightness.length; i++) {
      expect(brightness[i]).toBeGreaterThan(brightness[i - 1]);
    }
  });
});
