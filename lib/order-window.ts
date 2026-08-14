import type { CalcResult } from "@/lib/calc"
import type { DoseOverrides } from "@/lib/dose-overrides"
import { buildRegimenLines, type RenderLine } from "@/lib/regimen-render"
import { getOrderMedsForDay, type OrderMedWithMeta } from "@/lib/order-schedule"
import { DEFAULT_SCHEDULE_SETTINGS, type ScheduleSettings } from "@/lib/schedule-settings"

/**
 * 오더창 = 레지멘 전문(기울임체) + 실제 처방 오더(정자 + 수행시간)
 * 레지멘 라인 아래에 해당 라인에서 파생된 오더를 붙여서 렌더한다.
 */
export type OrderWindowRow =
  | { kind: "regimen"; key: string; line: RenderLine }
  | { kind: "med"; key: string; med: OrderMedWithMeta }

/**
 * 동의서 응답은 첫 항암 투약일에만 적용.
 * 이후 날짜는 기본 시작시간 + 일자별 "항암제 당기기" 설정을 사용한다.
 */
export function effectiveSettings(
  settings: ScheduleSettings,
  day: number,
  firstDay: number,
): ScheduleSettings {
  const pullForward = settings.pullForward ?? {}
  if (day === firstDay) return { ...settings, pullForward }
  return { ...DEFAULT_SCHEDULE_SETTINGS, consentReceived: true, pullForward }
}

/* ------------------------------------------------------------------ *
 * 기울임체 레지멘 텍스트 정리
 *  얼음 / EKG / cc/hr 등 "오더 실행 정보"는 오더 행의 수행시간 옆에만 표기
 * ------------------------------------------------------------------ */

const STRIP_PATTERNS: RegExp[] = [
  /\s*\(\s*얼음[^)]*\)/g,
  /\s*\[\s*얼음[^\]]*\]/g,
  /\s*,?\s*얼음\s*(\/\s*)?/g,
  /\s*\(\s*EKG[^)]*\)/g,
  /\s*,?\s*EKG\s*(monitoring)?/g,
  /\s*\d+(\.\d+)?\s*~?\s*\d*\s*cc\/hr/g,
]

function stripOrderInfo(text: string): string {
  let out = text
  for (const re of STRIP_PATTERNS) out = out.replace(re, "")
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.)])/g, "$1").trimEnd()
}

function sanitizeLine(line: RenderLine): RenderLine {
  if (line.segments) {
    const segments = line.segments
      .map((s) => ({ ...s, text: stripOrderInfo(s.text) }))
      .filter((s) => s.text.trim().length > 0)
    return { ...line, segments }
  }
  if (line.text) return { ...line, text: stripOrderInfo(line.text) }
  return line
}

/** med id → 레지멘 라인 매칭 키워드 */
const ANCHORS: { test: (id: string) => boolean; keywords: string[] }[] = [
  { test: (id) => id.startsWith("thiotepa"), keywords: ["Thiotepa"] },
  { test: (id) => id.startsWith("busulfan"), keywords: ["Busulfan"] },
  { test: (id) => id.startsWith("levetiracetam 500mg"), keywords: ["Levetiracetam", "Keppra", "다음날 500mg PO"] },
  { test: (id) => id.startsWith("levetiracetam 1g"), keywords: ["Levetiracetam 1500mg", "Keppra"] },
  { test: (id) => id === "ptcy", keywords: ["PTCy", "Cyclophosphamide"] },
  { test: (id) => id.startsWith("cyclophosphamide"), keywords: ["Cyclophosphamide"] },
  { test: (id) => id.startsWith("palonosetron"), keywords: ["Palonosetron"]
   },
  { test: (id) => id.startsWith("granisetron-po"), keywords: ["Granisetron", "Serotonin antagnoist PO", "Serotonin antagonist PO"]},
  { test: (id) => id.startsWith("aprepitant 125mg"), keywords: ["aprepitant 125mg", "Aprepitant 125mg"] },
  { test: (id) => id.startsWith("aprepitant 80mg"), keywords: ["aprepitant 80mg", "Aprepitant 80mg"] },
  {
    test: (id) => id.startsWith("granisetron-iv"),
    keywords: ["Granisetron", "Serotonin antagonist IV"],
  },
  { test: (id) => id.startsWith("mesna"), keywords: ["Mesna"] },
  { test: (id) => id.startsWith("hyd"), keywords: ["hydration", "Hydration", "cc/hr"] },
  { test: (id) => id.startsWith("hydration"), keywords: ["hydration", "Hydration"] },
  { test: (id) => id.startsWith("furosemide"), keywords: ["furosemide 20mg", "Furosemide 20mg"] },
  { test: (id) => id.startsWith("furosemide 10mg"), keywords: ["furosemide 10mg", "Furosemide 10mg"] },
  { test: (id) => id.startsWith("citopcin"), keywords: ["Ciprofloxacin"] },
  { test: (id) => id.startsWith("ursa"), keywords: ["UDCA"] },
  { test: (id) => id.startsWith("mycamine"), keywords: ["Micafungin"] },
  { test: (id) => id.startsWith("zyprexa"), keywords: ["Olanzapine"] },
  { test: (id) => id.startsWith("melphalan"), keywords: ["Melphalan"] },
  { test: (id) => id.startsWith("dexamethasone 12mg"), keywords: ["dexamethasone 12mg", "Dexamethasone 12mg"] },
  { test: (id) => id.startsWith("dexamethasone 10mg"), keywords: ["dexamethasone 10mg", "Dexamethasone 10mg"] },
  { test: (id) => id.startsWith("dexamethasone 8mg"), keywords: ["dexamethasone 8mg", "Dexamethasone 8mg"] },
  { test: (id) => id.startsWith("fludarabine"), keywords: ["Fludarabine"] },
  { test: (id) => id.startsWith("mtx"), keywords: ["MTX", "Methotrexate"] },
  { test: (id) => id === "atg", keywords: ["ATG (Rabbit", "ATG"] },
  { test: (id) => id.startsWith("mpred"), keywords: ["Methylprednisolone", "M-pred"] },
  { test: (id) => id.startsWith("acetaminophen"), keywords: ["Acetaminophen"] },
  { test: (id) => id.startsWith("chlorpheniramine"), keywords: ["Chlorpheniramine"] },
  { test: (id) => id.startsWith("hydrocortisone"), keywords: ["Hydrocortisone"] },
  { test: (id) => id.startsWith("tacrolimus"), keywords: ["Tacrolimus"] },
  { test: (id) => id.startsWith("mmf"), keywords: ["MMF", "Mycophenolate"] },
  { test: (id) => id.startsWith("stemcell"), keywords: ["Stem cell infusion"] },
]

function lineText(line: RenderLine): string {
  if (line.segments) return line.segments.map((s) => s.text).join("")
  return line.text ?? ""
}

function extractDoseText(line: RenderLine): string | undefined {
  if (!line.segments) return undefined
  const red = line.segments
    .filter((s) => s.red && /\d/.test(s.text))
    .map((s) => s.text.trim())
    .join(" ")
  const m = red.match(/\d+(\.\d+)?\s*(mg|g|mg\/m2|g\/m2|mg\/m²)/i)
  return m ? m[0] : undefined
}

function anchorIndex(medId: string, lines: RenderLine[]): number {
  const entry = ANCHORS.find((a) => a.test(medId))
  if (!entry) return -1
  for (const kw of entry.keywords) {
    const idx = lines.findIndex((l) => (l.kind ?? "normal") !== "title" && lineText(l).includes(kw))
    if (idx >= 0) return idx
  }
  return -1
}

export interface OrderWindowInput {
  regimenId: string | null
  day: number
  days: number[]
  calc: CalcResult
  doseOverrides: DoseOverrides
  settings: ScheduleSettings
}

export interface OrderWindow {
  rows: OrderWindowRow[]
  /** 해당 일자에 실제 처방되는 오더 */
  meds: OrderMedWithMeta[]
  /** 첫 항암 투약일인지 (동의서 질문 노출 조건) */
  isFirstDay: boolean
}

export function buildOrderWindow(input: OrderWindowInput): OrderWindow {
  const { regimenId, day, days, calc, doseOverrides, settings } = input
  const firstDay = days[0] ?? day
  const isFirstDay = day === firstDay
  const eff = effectiveSettings(settings, day, firstDay)

  const lines = buildRegimenLines(regimenId, calc, doseOverrides).map(sanitizeLine)
  const rawMeds = getOrderMedsForDay(regimenId, day, eff, days)

  // 레지멘 라인에서 총 용량 추출 후 OrderMed에 주입
  const meds = rawMeds.map((med) => {
    const idx = anchorIndex(med.id, lines)
    const doseText = idx >= 0 ? extractDoseText(lines[idx]) : undefined
    return { ...med, doseText }
  })

  // 라인별 오더 그룹
  const byIndex = new Map<number, OrderMedWithMeta[]>()
  const unmatched: OrderMedWithMeta[] = []
  for (const med of meds) {
    const idx = anchorIndex(med.id, lines)
    if (idx < 0) {
      unmatched.push(med)
      continue
    }
    const arr = byIndex.get(idx) ?? []
    arr.push(med)
    byIndex.set(idx, arr)
  }

  const rows: OrderWindowRow[] = []
  lines.forEach((line, i) => {
    rows.push({ kind: "regimen", key: `l${i}`, line })
    if ((line.kind ?? "normal") === "spacer") return
    for (const med of byIndex.get(i) ?? []) {
      rows.push({ kind: "med", key: `m${i}-${med.id}`, med })
    }
  })
  for (const med of unmatched) {
    rows.push({ kind: "med", key: `mx-${med.id}`, med })
  }

  return { rows, meds, isFirstDay }
}

/* ------------------------------------------------------------------ *
 * PRN order (모든 일자 공통)
 * ------------------------------------------------------------------ */

export interface PrnOrder {
  id: string
  name: string
  detail: string
  badge: "PRN" | "TIT" | "SUP"
}

export const PRN_ORDERS: PrnOrder[] = [
  { id: "lasix", name: "Lasix inj 20mg (Furosemide)", detail: "20 mg [IV] prn", badge: "PRN" },
  {
    id: "chlorph-prn",
    name: "Chlorpheniramine inj 4mg",
    detail: "4 mg [IVS] prn",
    badge: "PRN",
  },
  { id: "ns100", name: "0.9% NS 100ml", detail: "1 bag [IV] prn", badge: "SUP" },
  { id: "ns50", name: "0.9% NS 50ml", detail: "1 bag [IV] prn", badge: "SUP" },
  { id: "d5w50", name: "5% Dextrose 50mL", detail: "1 bag [IV] prn", badge: "SUP" },
  { id: "d5w20", name: "5% Dextrose 20cc amp", detail: "1 amp [IV] prn", badge: "SUP" },
]
