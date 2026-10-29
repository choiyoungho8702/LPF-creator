export interface LpfPreset {
  cutoffFrequency: number;
  order: number;
  blockSize: number;
  arithmeticMode: "float" | "fixed";
  qFormatName: "Q15" | "Q23" | "Q31";
}

export function serializePreset(preset: LpfPreset): string {
  return JSON.stringify(preset, null, 2);
}

export function parsePreset(json: string): LpfPreset {
  const parsed: unknown = JSON.parse(json);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as LpfPreset).cutoffFrequency !== "number" ||
    typeof (parsed as LpfPreset).order !== "number" ||
    typeof (parsed as LpfPreset).blockSize !== "number" ||
    ((parsed as LpfPreset).arithmeticMode !== "float" &&
      (parsed as LpfPreset).arithmeticMode !== "fixed") ||
    !["Q15", "Q23", "Q31"].includes((parsed as LpfPreset).qFormatName)
  ) {
    throw new Error("유효하지 않은 프리셋 형식입니다.");
  }

  return parsed as LpfPreset;
}
