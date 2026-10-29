"use client";

import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { designButterworthLowpass } from "@/lib/butterworth";
import { generateFloatBiquadCCode } from "@/lib/codegen";
import { generateFixedPointBiquadCCode } from "@/lib/codegen-fixed";
import { applyBiquadCascade } from "@/lib/filter";
import { parseFlacHeader } from "@/lib/flac";
import { QFormat } from "@/lib/fixed-point";
import { simulateFixedPointBiquadCascade } from "@/lib/fixed-point-simulate";
import { decodePcmSamples } from "@/lib/pcm";
import { parsePreset, serializePreset, type LpfPreset } from "@/lib/preset";
import { computeMaxAbsoluteError } from "@/lib/quantization-error";
import { recommendCutoffFrequency } from "@/lib/smart-recommend";
import { computeSpectrogram, type SpectrogramResult } from "@/lib/spectrogram";
import { SpectrogramView } from "@/components/spectrogram-view";

const SPECTROGRAM_WINDOW_SIZE = 1024;
const SPECTROGRAM_HOP_SIZE = 256;
import { WAV_DATA_OFFSET, encodeWavFile, parseWavHeader, type WavHeader } from "@/lib/wav";

const ORDER_OPTIONS = [2, 4, 6, 8] as const;
const Q_FORMAT_OPTIONS = ["Q15", "Q23", "Q31"] as const;
type QFormatName = (typeof Q_FORMAT_OPTIONS)[number];

interface GeneratedFile {
  name: string;
  url: string;
  kind: "wav" | "c";
  createdAt: number;
}

const SAMPLE_AUDIO_FILES = [
  { name: "sample-broadband-sweep.wav", label: "샘플: 20Hz~20kHz 스윕" },
];

export default function Home() {
  const [header, setHeader] = useState<WavHeader | null>(null);
  const [channelData, setChannelData] = useState<Float32Array[] | null>(null);
  const [cutoffFrequency, setCutoffFrequency] = useState(1000);
  const [order, setOrder] = useState(4);
  const [blockSize, setBlockSize] = useState(32);
  const [arithmeticMode, setArithmeticMode] = useState<"float" | "fixed">("float");
  const [qFormatName, setQFormatName] = useState<QFormatName>("Q15");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [overflowDetected, setOverflowDetected] = useState(false);
  const [quantizationError, setQuantizationError] = useState<number | null>(null);
  const [spectrogramData, setSpectrogramData] = useState<{
    original: SpectrogramResult;
    filtered: SpectrogramResult;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null);
  const [rawSampleRate, setRawSampleRate] = useState(44100);
  const [rawChannels, setRawChannels] = useState(1);
  const [rawBitDepth, setRawBitDepth] = useState<16 | 24>(16);

  const [manualSampleRate, setManualSampleRate] = useState(44100);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isSpectrumOpen, setIsSpectrumOpen] = useState(true);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);

  const effectiveSampleRate = header?.sampleRate ?? manualSampleRate;

  function addGeneratedFile(file: GeneratedFile) {
    setGeneratedFiles((previous) => {
      const next = [file, ...previous];
      const evicted = next.splice(10);
      evicted.forEach((f) => URL.revokeObjectURL(f.url));
      return next;
    });
  }

  async function processFile(file: File) {
    setError(null);
    setResultUrl(null);

    const isRaw = /\.(raw|pcm)$/i.test(file.name);
    const buffer = await file.arrayBuffer();

    if (/\.flac$/i.test(file.name)) {
      setHeader(parseFlacHeader(buffer));
      setChannelData(null);
      setError("FLAC은 헤더 정보만 읽을 수 있습니다. 오디오 디코딩은 아직 지원하지 않아 실행할 수 없습니다.");
      return;
    }

    if (isRaw) {
      setHeader(null);
      setChannelData(null);
      setRawBuffer(buffer);
      return;
    }

    const parsedHeader = parseWavHeader(buffer);

    if (parsedHeader.bitDepth !== 16 && parsedHeader.bitDepth !== 24) {
      setHeader(null);
      setChannelData(null);
      setError("현재는 16비트 또는 24비트 WAV 파일만 지원합니다.");
      return;
    }

    setHeader(parsedHeader);
    setChannelData(
      decodePcmSamples(buffer.slice(WAV_DATA_OFFSET), {
        bitDepth: parsedHeader.bitDepth as 16 | 24,
        channels: parsedHeader.channels,
      }),
    );
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await processFile(file);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await processFile(file);
  }

  async function handleLoadSample(url: string, name: string) {
    const buffer = await fetch(url).then((r) => r.blob());
    await processFile(new File([buffer], name, { type: "audio/wav" }));
  }

  function handleApplyRawFormat() {
    if (!rawBuffer) return;

    setHeader({ sampleRate: rawSampleRate, bitDepth: rawBitDepth, channels: rawChannels });
    setChannelData(decodePcmSamples(rawBuffer, { bitDepth: rawBitDepth, channels: rawChannels }));
    setRawBuffer(null);
  }

  function handleGenerateCodeOnly() {
    if (cutoffFrequency >= effectiveSampleRate / 2) {
      setError(
        `Fc(${cutoffFrequency}Hz)는 Nyquist 주파수(${effectiveSampleRate / 2}Hz) 미만이어야 합니다.`,
      );
      return;
    }

    setError(null);

    const sections = designButterworthLowpass({
      sampleRate: effectiveSampleRate,
      cutoffFrequency,
      order,
    });

    const code =
      arithmeticMode === "float"
        ? generateFloatBiquadCCode({ sections, blockSize })
        : generateFixedPointBiquadCCode({ sections, blockSize, qFormat: QFormat[qFormatName] });

    setGeneratedCode(code);
    setOverflowDetected(false);
    setQuantizationError(null);

    const blob = new Blob([code], { type: "text/x-c" });
    addGeneratedFile({
      name: `lpf_${arithmeticMode}_fc${cutoffFrequency}.c`,
      url: URL.createObjectURL(blob),
      kind: "c",
      createdAt: Date.now(),
    });
  }

  async function handleRun() {
    if (!header || !channelData) return;

    if (cutoffFrequency >= header.sampleRate / 2) {
      setError(
        `Fc(${cutoffFrequency}Hz)는 Nyquist 주파수(${header.sampleRate / 2}Hz) 미만이어야 합니다.`,
      );
      setResultUrl(null);
      return;
    }

    setError(null);
    setIsProcessing(true);
    // 로딩 상태가 실제로 화면에 그려지도록 다음 프레임까지 양보한 뒤 무거운 계산을 시작한다.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const sections = designButterworthLowpass({
        sampleRate: header.sampleRate,
        cutoffFrequency,
        order,
      });

      const filtered = channelData.map((samples) => applyBiquadCascade(samples, sections));
      const buffer = encodeWavFile(filtered, {
        sampleRate: header.sampleRate,
        bitDepth: header.bitDepth as 16 | 24,
      });
      const blob = new Blob([buffer], { type: "audio/wav" });
      const wavUrl = URL.createObjectURL(blob);

      setResultUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return wavUrl;
      });
      addGeneratedFile({
        name: `lpf_result_fc${cutoffFrequency}.wav`,
        url: wavUrl,
        kind: "wav",
        createdAt: Date.now(),
      });

      const spectrogramOptions = {
        windowSize: SPECTROGRAM_WINDOW_SIZE,
        hopSize: SPECTROGRAM_HOP_SIZE,
      };
      setSpectrogramData({
        original: computeSpectrogram(channelData[0], header.sampleRate, spectrogramOptions),
        filtered: computeSpectrogram(filtered[0], header.sampleRate, spectrogramOptions),
      });

      if (arithmeticMode === "float") {
        const code = generateFloatBiquadCCode({ sections, blockSize });
        setGeneratedCode(code);
        setOverflowDetected(false);
        setQuantizationError(null);
        addGeneratedFile({
          name: `lpf_float_fc${cutoffFrequency}.c`,
          url: URL.createObjectURL(new Blob([code], { type: "text/x-c" })),
          kind: "c",
          createdAt: Date.now(),
        });
        return;
      }

      const qFormat = QFormat[qFormatName];
      const code = generateFixedPointBiquadCCode({ sections, blockSize, qFormat });
      setGeneratedCode(code);
      addGeneratedFile({
        name: `lpf_fixed_${qFormatName}_fc${cutoffFrequency}.c`,
        url: URL.createObjectURL(new Blob([code], { type: "text/x-c" })),
        kind: "c",
        createdAt: Date.now(),
      });

      const simulations = channelData.map((samples) =>
        simulateFixedPointBiquadCascade(samples, sections, qFormat),
      );
      setOverflowDetected(simulations.some((s) => s.overflowDetected));
      setQuantizationError(
        Math.max(...simulations.map((s, i) => computeMaxAbsoluteError(filtered[i], s.output))),
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleCopyCode() {
    if (!generatedCode) return;
    await navigator.clipboard.writeText(generatedCode);
  }

  function handleSmartRecommend() {
    if (!header || !channelData) return;
    setCutoffFrequency(Math.round(recommendCutoffFrequency(channelData[0], header.sampleRate)));
  }

  function handleSavePreset() {
    const preset: LpfPreset = { cutoffFrequency, order, blockSize, arithmeticMode, qFormatName };
    const blob = new Blob([serializePreset(preset)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lpf-preset.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleLoadPreset(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const preset = parsePreset(await file.text());
      setCutoffFrequency(preset.cutoffFrequency);
      setOrder(preset.order);
      setBlockSize(preset.blockSize);
      setArithmeticMode(preset.arithmeticMode);
      setQFormatName(preset.qFormatName);
      setError(null);
    } catch {
      setError("프리셋 파일을 읽을 수 없습니다. 올바른 JSON 형식인지 확인해주세요.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex w-full max-w-xl flex-col gap-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
            LPF Creator
          </h1>
          <p className="text-muted-foreground">
            WAV 파일로 Butterworth 저역통과필터를 시뮬레이션·검증하고, 임베디드 프로젝트에 바로 쓸 수 있는 실시간 C 코드까지 생성하세요.
          </p>
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="file">오디오 파일 (WAV 16/24비트, FLAC(헤더만), 또는 raw/pcm)</FieldLabel>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleDrop}
              className={`rounded-md border-2 border-dashed p-3 transition-colors ${
                isDraggingOver ? "border-primary bg-accent" : "border-input"
              }`}
            >
              <Input id="file" type="file" accept=".wav,.flac,.raw,.pcm" onChange={handleFileChange} />
              <p className="mt-1 text-xs text-muted-foreground">
                파일을 여기로 끌어다 놓아도 됩니다
              </p>
            </div>
          </Field>

          <div className="flex flex-wrap gap-2">
            {SAMPLE_AUDIO_FILES.map((sample) => (
              <Button
                key={sample.name}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleLoadSample(`/samples/${sample.name}`, sample.name)}
              >
                {sample.label}
              </Button>
            ))}
          </div>

          <Dialog open={rawBuffer !== null} onOpenChange={(open) => !open && setRawBuffer(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>원시 데이터 규격 입력</DialogTitle>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="rawSampleRate">Sampling Rate (Hz)</FieldLabel>
                  <Input
                    id="rawSampleRate"
                    type="number"
                    value={rawSampleRate}
                    onChange={(e) => setRawSampleRate(Number(e.target.value))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rawBitDepth">Bit Depth</FieldLabel>
                  <Select
                    value={String(rawBitDepth)}
                    onValueChange={(value) => setRawBitDepth(Number(value) as 16 | 24)}
                  >
                    <SelectTrigger id="rawBitDepth">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16">16-bit</SelectItem>
                      <SelectItem value="24">24-bit</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="rawChannels">Channels</FieldLabel>
                  <Select
                    value={String(rawChannels)}
                    onValueChange={(value) => setRawChannels(Number(value))}
                  >
                    <SelectTrigger id="rawChannels">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Mono</SelectItem>
                      <SelectItem value="2">Stereo</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button type="button" onClick={handleApplyRawFormat}>
                  적용
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {header ? (
            <p className="text-sm text-muted-foreground">
              Fs: {header.sampleRate}Hz · 비트 뎁스: {header.bitDepth}bit · 채널:{" "}
              {header.channels}
            </p>
          ) : (
            <Field orientation="responsive">
              <FieldLabel htmlFor="manualSampleRate">
                Sampling Rate (Hz) — 음원 없이 C 코드만 생성할 때 사용
              </FieldLabel>
              <Input
                id="manualSampleRate"
                type="number"
                value={manualSampleRate}
                onChange={(e) => setManualSampleRate(Number(e.target.value))}
              />
            </Field>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleSmartRecommend}
            disabled={!header || !channelData}
          >
            🪄 스마트 추천
          </Button>

          <Field orientation="responsive">
            <FieldLabel htmlFor="fc">Cutoff Frequency (Fc)</FieldLabel>
            <Input
              id="fc"
              type="number"
              value={cutoffFrequency}
              onChange={(e) => setCutoffFrequency(Number(e.target.value))}
            />
          </Field>

          <Field orientation="responsive">
            <FieldLabel htmlFor="order">Order</FieldLabel>
            <Select value={String(order)} onValueChange={(value) => setOrder(Number(value))}>
              <SelectTrigger id="order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="responsive">
            <FieldLabel htmlFor="blockSize">Block Size</FieldLabel>
            <Input
              id="blockSize"
              type="number"
              value={blockSize}
              onChange={(e) => setBlockSize(Number(e.target.value))}
            />
          </Field>

          <Field orientation="responsive">
            <FieldLabel htmlFor="arithmeticMode">연산 방식</FieldLabel>
            <Select
              value={arithmeticMode}
              onValueChange={(value) => setArithmeticMode(value as "float" | "fixed")}
            >
              <SelectTrigger id="arithmeticMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="float">Float</SelectItem>
                <SelectItem value="fixed">정수 고정소수점</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {arithmeticMode === "fixed" && (
            <Field orientation="responsive">
              <FieldLabel htmlFor="qFormat">Q-Format</FieldLabel>
              <Select
                value={qFormatName}
                onValueChange={(value) => setQFormatName(value as QFormatName)}
              >
                <SelectTrigger id="qFormat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Q_FORMAT_OPTIONS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={handleSavePreset}>
              💾 프리셋 저장
            </Button>
            <label className={buttonVariants({ variant: "outline" })}>
              프리셋 불러오기
              <input type="file" accept=".json" className="hidden" onChange={handleLoadPreset} />
            </label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button onClick={handleRun} disabled={!header || !channelData || isProcessing}>
              {isProcessing ? "처리 중..." : "실행"}
            </Button>
            <Button type="button" variant="outline" onClick={handleGenerateCodeOnly}>
              C 코드만 생성
            </Button>
          </div>

          {arithmeticMode === "fixed" && overflowDetected && (
            <p className="text-sm text-destructive">
              ⚠ 정수 연산 중 지정한 비트 범위를 초과하는 오버플로우가 감지되었습니다.
            </p>
          )}

          {arithmeticMode === "fixed" && quantizationError !== null && (
            <p className="text-sm text-muted-foreground">
              양자화 오차(최대 절댓값): {quantizationError.toFixed(6)}
            </p>
          )}

          {spectrogramData && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setIsSpectrumOpen((open) => !open)}
                className="flex items-center gap-1 text-left"
              >
                <FieldLabel>시간-주파수 분포 (스펙트로그램)</FieldLabel>
                <span className="text-xs text-muted-foreground">
                  {isSpectrumOpen ? "▲ 접기" : "▼ 펼치기"}
                </span>
              </button>
              {isSpectrumOpen && (
                <div className="flex flex-col gap-3">
                  <SpectrogramView result={spectrogramData.original} label="원본" />
                  <SpectrogramView result={spectrogramData.filtered} label="필터링 후" />
                </div>
              )}
            </div>
          )}

          {resultUrl && <audio controls src={resultUrl} className="w-full" />}

          {generatedCode && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <FieldLabel>생성된 C 코드</FieldLabel>
                <Button type="button" variant="outline" size="sm" onClick={handleCopyCode}>
                  복사
                </Button>
              </div>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted p-4 text-xs">
                <code>{generatedCode}</code>
              </pre>
            </div>
          )}

          {generatedFiles.length > 0 && (
            <div className="flex flex-col gap-2">
              <FieldLabel>생성된 파일</FieldLabel>
              <ul className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm">
                {generatedFiles.map((file) => (
                  <li key={file.url} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {file.kind === "wav" ? "🎵" : "💻"} {file.name}
                    </span>
                    <a
                      href={file.url}
                      download={file.name}
                      className="shrink-0 text-xs text-primary underline underline-offset-2"
                    >
                      다운로드
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </FieldGroup>
      </div>
    </main>
  );
}
