import type { CalcResult } from "@/lib/calc"
import type { DoseOverrides } from "@/lib/dose-overrides"
import { buildRegimenLines, type RenderLine } from "@/lib/regimen-render"
import {
  getOrderMedsForDay,
  getFirstChemoDay,
  getHydrationTimes,
  hasChemoForDay,
  type OrderTimeOverrides,
  type OrderMedWithMeta,
} from "@/lib/order-schedule"
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
  if (day < firstDay) {
    return {
      ...DEFAULT_SCHEDULE_SETTINGS,
      pullForward,
      donorType: settings.donorType,
    }
  }
  // 첫날 이후에도 동의서/시작시간 선택을 그대로 유지 → 전일 투약시간과 연동
  return { ...settings, pullForward }
}

/* ------------------------------------------------------------------ *
 * 기울임체 레지멘 텍스트 정리
 *  얼음 / EKG / ch 등 "오더 실행 정보"는 오더 행의 수행시간 옆에만 표기
 * ------------------------------------------------------------------ */

const STRIP_PATTERNS: RegExp[] = [
  /\s*\(\s*얼음[^)]*\)/g,
  /\s*\[\s*얼음[^\]]*\]/g,
  /\s*,?\s*얼음\s*(\/\s*)?/g,
  /\s*\(\s*EKG[^)]*\)/g,
  /\s*,?\s*EKG\s*(monitoring)?/g,
  /\s*\d+(\.\d+)?\s*~?\s*\d*\s*(?:cc\/hr|ch)\b/g,
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
  { test: (id) => id === "tbi", keywords: ["Total Body Irradiation", "TBI 300rad"] },
  { test: (id) => id === "tbi-acetaminophen", keywords: ["Acetaminophen 650mg"] },
  { test: (id) => id === "tbi-diazepam", keywords: ["diazepam 10mg", "Diazepam 10mg"] },
  { test: (id) => id === "tbi-hydrocortisone", keywords: ["Hydrocortisone 100mg"] },
  { test: (id) => id === "tbi-metoclopramide", keywords: ["Metoclopramide 10mg"] },
  { test: (id) => id.startsWith("busulfan"), keywords: ["Busulfan"] },
  { test: (id) => id.startsWith("etoposide"), keywords: ["Etoposide"] },
  { test: (id) => id.includes("levetiracetam-loading"), keywords: ["Levetiracetam 1500mg", "Levetriacetam  1500mg", "투약 3-4시간 전"] },
  { test: (id) => id.includes("levetiracetam-500mg") || id.startsWith("levetiracetam 500mg"), keywords: ["다음날부터 500mg", "500mg  PO bid", "Levetiracetam", "Keppra"] },
  { test: (id) => id.startsWith("levetiracetam 1g"), keywords: ["Levetiracetam 1500mg", "Keppra"] },
  { test: (id) => id === "ptcy", keywords: ["PTCy", "Cyclophosphamide"] },
  { test: (id) => id === "cyclophosphamide-fc", keywords: ["Cyclophosphamide"] },
  { test: (id) => id.startsWith("cyclophosphamide"), keywords: ["Cyclophosphamide"] },
  { test: (id) => id.startsWith("palonosetron"), keywords: ["Palonosetron"]
   },
  { test: (id) => id.startsWith("granisetron-po"), keywords: ["Granisetron", "Serotonin antagnoist PO", "Serotonin antagonist PO", "serotonin antagonist PO"]},
  { test: (id) => id.startsWith("aprepitant 125mg"), keywords: ["aprepitant 125mg", "Aprepitant 125mg"] },
  { test: (id) => id.startsWith("aprepitant 80mg"), keywords: ["aprepitant 80mg", "Aprepitant 80mg"] },
  {
    test: (id) => id.startsWith("granisetron-iv"),
    keywords: ["Granisetron", "Serotonin antagonist IV", "serotonin antagonist IV"],
  },
  { test: (id) => id.startsWith("mesna"), keywords: ["Mesna"] },
  { test: (id) => id.startsWith("hydration-high"), keywords: ["3L/m²/day", "3 L/m²/day", "3L/m2/day", "3 L/m2/day"] },
  { test: (id) => id.startsWith("hydration-low"), keywords: ["1.5L/m²/day", "1.5 L/m²/day", "1.5L/m2/day", "1.5 L/m2/day"] },
  { test: (id) => id.startsWith("hyd"), keywords: ["hydration", "Hydration", "cc/hr"] },
  { test: (id) => id.startsWith("hydration"), keywords: ["hydration", "Hydration"] },
  { test: (id) => id.startsWith("furosemide 20mg"), keywords: ["furosemide 20mg", "Furosemide 20mg"] },
  { test: (id) => id.startsWith("furosemide 10mg"), keywords: ["furosemide 10mg", "Furosemide 10mg"] },
  { test: (id) => id.startsWith("urine-output"), keywords: ["check urine output", "Check urine output"] },
  { test: (id) => id.startsWith("citopcin"), keywords: ["Ciprofloxacin"] },
  { test: (id) => id.startsWith("acyclovir"), keywords: ["acyclovir", "Acyclovir"] },
  { test: (id) => id.startsWith("ursa"), keywords: ["UDCA"] },
  { test: (id) => id.startsWith("mycamine"), keywords: ["Micafungin", "micafungin", "mycafungin"] },
  { test: (id) => id.startsWith("zyprexa"), keywords: ["Olanzapine"] },
  { test: (id) => id.startsWith("melphalan"), keywords: ["Melphalan"] },
  { test: (id) => id.startsWith("dexamethasone 12mg"), keywords: ["dexamethasone 12mg", "Dexamethasone 12mg", "dexa 12mg", "Dexa 12mg"] },
  { test: (id) => id.startsWith("dexamethasone 10mg"), keywords: ["dexamethasone 10mg", "Dexamethasone 10mg", "dexa 10mg", "Dexa 10mg"] },
  { test: (id) => id.startsWith("dexamethasone 8mg"), keywords: ["dexamethasone 8mg", "Dexamethasone 8mg", "dexa 8mg", "Dexa 8mg"] },
  { test: (id) => id.startsWith("fludarabine"), keywords: ["Fludarabine"] },
  { test: (id) => id.startsWith("mtx"), keywords: ["MTX", "Methotrexate"] },
  { test: (id) => id.startsWith("atg"), keywords: ["ATG (Rabbit", "ATG"] },
  { test: (id) => id.startsWith("mpred"), keywords: ["Methylprednisolone", "methylprednisolone", "M-pred"] },
  { test: (id) => id === "acetaminophen-atg-tbi-cy", keywords: ["Acetaminophen 600mg"] },
  { test: (id) => id === "chlorpheniramine-atg-tbi-cy", keywords: ["Chlorpheniramin 4mg", "Chlorpheniramine 4mg"] },
  { test: (id) => id === "hydrocortisone-atg-tbi-cy", keywords: ["Hydrocortisone 50mg"] },
  { test: (id) => id.startsWith("acetaminophen"), keywords: ["Acetaminophen"] },
  { test: (id) => id.startsWith("chlorpheniramine"), keywords: ["Chlorpheniramine"] },
  { test: (id) => id.startsWith("hydrocortisone"), keywords: ["Hydrocortisone"] },
  { test: (id) => id.startsWith("hydroxyzine"), keywords: ["Hydroxyzine"] },
  { test: (id) => id.startsWith("cyclosporine"), keywords: ["Cyclosporin A", "Cyclosporine"] },
  { test: (id) => id.startsWith("tacrolimus"), keywords: ["Tacrolimus"] },
  { test: (id) => id.startsWith("ivig"), keywords: ["IVIg 500mg/kg", "IVIg"] },
  { test: (id) => id.startsWith("letermovir"), keywords: ["letermovir", "Letermovir"] },
  { test: (id) => id.startsWith("tmp-smx"), keywords: ["TMP/SMX"] },
  { test: (id) => id.startsWith("fluconazole"), keywords: ["fluconazole", "Fluconazole"] },
  { test: (id) => id.startsWith("mmf"), keywords: ["MMF", "Mycophenolate"] },
  { test: (id) => id.startsWith("stemcell"), keywords: ["Stem cell infusion"] },
]

/**
 * 신규 레지멘은 설명/선택 헤더에도 약제명이 반복되므로 키워드 검색만으로는
 * 계산 세그먼트가 없는 앞줄에 잘못 붙을 수 있다. 실제 처방 행은 source id로
 * 우선 연결하고, 기존 레지멘만 아래 키워드 fallback을 사용한다.
 */
const SOURCE_LINE_ID_BY_MED_ID: Record<string, string> = {
  "levetiracetam 500mg": "levetiracetam",
  "hydration-high-thiobucy": "tbc-furosemide",
  "furosemide 10mg-thiobucy": "tbc-furosemide",
  "urine-output-thiobucy": "tbc-furosemide",
  "hydration-high-ptcy": "ptcy-furosemide",
  "furosemide 10mg-ptcy": "ptcy-furosemide",
  "urine-output-ptcy": "ptcy-furosemide",
  "busulfan-bucyeto": "bucyeto-busulfan",
  "etoposide-bucyeto": "bucyeto-etoposide",
  "cyclophosphamide-bucyeto": "bucyeto-cyclophosphamide",
  "levetiracetam-loading-bucyeto": "bucyeto-levetiracetam-loading",
  "levetiracetam-500mg-bucyeto": "bucyeto-levetiracetam-maintenance",
  "mesna-bucyeto": "bucyeto-mesna",
  "furosemide 10mg-bucyeto": "bucyeto-furosemide",
  "hydration-high-bucyeto": "bucyeto-furosemide",
  "hydration-low-bucyeto": "bucyeto-furosemide",
  "urine-output-bucyeto": "bucyeto-furosemide",
  "busulfan-bumel": "bumel-busulfan",
  "levetiracetam-loading-bumel": "bumel-levetiracetam-loading",
  "levetiracetam-500mg-bumel": "bumel-levetiracetam-maintenance",
  "melphalan-bumel": "bumel-melphalan",
  "ivig-bumel": "bumel-ivig",
  tbi: "tbi",
  "tbi-acetaminophen": "tbi-premed-acetaminophen",
  "tbi-diazepam": "tbi-premed-diazepam",
  "tbi-hydrocortisone": "tbi-premed-hydrocortisone",
  "tbi-metoclopramide": "tbi-premed-metoclopramide",
  "cyclophosphamide-tbi-cy": "tbi-cy-cyclophosphamide",
  "mesna-tbi-cy": "tbi-cy-mesna",
  "furosemide 10mg-tbi-cy": "tbi-cy-furosemide",
  "hydration-high-tbi-cy": "tbi-cy-furosemide",
  "hydration-low-tbi-cy": "tbi-cy-furosemide",
  "urine-output-tbi-cy": "tbi-cy-furosemide",
  "atg-tbi-cy": "tbi-cy-atg",
  "mpred-tbi-cy": "tbi-cy-mpred",
  "acetaminophen-atg-tbi-cy": "tbi-cy-atg-premed-1h",
  "chlorpheniramine-atg-tbi-cy": "tbi-cy-atg-premed-30m",
  "hydrocortisone-atg-tbi-cy": "tbi-cy-atg-post-hydrocortisone",
  "cyclosporine-tbi-cy": "tbi-cy-csa",
  "tacrolimus-tbi-cy": "tbi-cy-tacrolimus",
  "mtx-d1-tbi-cy": "tbi-cy-mtx",
  "mtx-d3d6-tbi-cy": "tbi-cy-mtx",
  "letermovir-tbi-cy": "tbi-cy-cmv-letermovir",
  "acyclovir-tbi-cy": "tbi-cy-acyclovir",
  "fludarabine-fc": "fc-fludarabine",
  "cyclophosphamide-fc": "fc-cyclophosphamide",
  "tmp-smx-fc": "fc-tmp-smx",
  "fluconazole-fc": "fc-fluconazole",
  "acyclovir-fc": "fc-acyclovir",
  "granisetron-iv-fc": "fc-antiemetic-iv",
  "granisetron-po-fc": "fc-antiemetic-po",
  "kymirah-cell-infusion-fc": "fc-cell-infusion",
  "chlorpheniramine-cell-infusion-fc": "fc-cell-antihistamine",
  "tacenol-cell-infusion-fc": "fc-cell-acetaminophen",
}

function lineText(line: RenderLine): string {
  if (line.segments) return line.segments.map((s) => s.text).join("")
  return line.text ?? ""
}

/** FC D1에서만 오더창에 표시하는 CAR-T infusion 안내. 레지멘 확인 화면에는 포함하지 않는다. */
const FC_D1_ORDER_ONLY_LINES: RenderLine[] = [
  {
    id: "fc-cell-infusion",
    text: "<Cell Infusion>",
    kind: "section",
    italic: true,
    checkbox: false,
  },
  {
    id: "fc-cell-antihistamine",
    text: "Diphenhydramine IV (50mg) or equivalent, infusion 1시간 전(+/-15분)",
    indent: 1,
    italic: true,
    checkbox: false,
  },
  {
    id: "fc-cell-acetaminophen",
    text: "Acetaminophen PO (650mg to 1000mg), infusion 30분 전(+/- 15분)",
    indent: 1,
    italic: true,
    checkbox: false,
  },
  {
    text: "V/S monitoring at infusion 시작(직전)",
    indent: 1,
    italic: true,
    checkbox: false,
  },
  { text: "infusion 종료 시(직후) (+-5분)", indent: 1, italic: true, checkbox: false },
  { text: "infusion 종료 후 30분 (+-10분)", indent: 1, italic: true, checkbox: false },
  { text: "infusion 종료 후 1시간 (+-10분)", indent: 1, italic: true, checkbox: false },
  { text: "infusion 종료 후 2시간 (+-10분)", indent: 1, italic: true, checkbox: false },
  { text: "—> 이후 check V/S q 4ours", indent: 1, italic: true, checkbox: false },
  { text: "", kind: "spacer" },
]

function addOrderOnlyLines(regimenId: string | null, day: number, lines: RenderLine[]): RenderLine[] {
  if (regimenId !== "fc") return lines
  const fcOrderLines = lines.map((line) => {
    if (line.id === "fc-antiemetic-po" && line.segments) {
      return {
        ...line,
        segments: line.segments.map((segment) => ({
          ...segment,
          text: segment.text.replace("D-2,-1,0", "D-2,-1,D1"),
        })),
      }
    }
    return line.text === "D-2,-1,0 serotonin antagonist PO (IV 와 동일 제제 투여)"
      ? { ...line, text: "D-2,-1,D1 serotonin antagonist PO (IV 와 동일 제제 투여)" }
      : line
  })
  if (day !== 1) return fcOrderLines
  const supportiveIndex = fcOrderLines.findIndex((line) => lineText(line).trim() === "Supportive Care")
  if (supportiveIndex < 0) return [...fcOrderLines, ...FC_D1_ORDER_ONLY_LINES]
  return [
    ...fcOrderLines.slice(0, supportiveIndex),
    ...FC_D1_ORDER_ONLY_LINES,
    ...fcOrderLines.slice(supportiveIndex),
  ]
}

function extractDoseText(line: RenderLine, medId: string): string | undefined {
  if (!line.segments) return undefined
  const red = line.segments
    .filter((s) => s.red && /\d/.test(s.text))
    .map((s) => s.text.trim())
    .join(" ")
  const matches = [
    ...red.matchAll(/[\d,]+(?:\.\d+)?\s*(mg|mcg|µg|g|mg\/m2|g\/m2|mg\/m²)/gi),
  ]
  const index = medId.includes("mtx-d3d6") ? 1 : 0
  const doseText = matches[index]?.[0]
  if (medId !== "etoposide-bucyeto" || !doseText) return doseText

  const doseMatch = doseText.match(/([\d,]+(?:\.\d+)?)\s*mg/i)
  if (!doseMatch) return doseText
  const totalMg = Number.parseFloat(doseMatch[1]!.replaceAll(",", ""))
  const halfMg = totalMg / 2
  const halfMl = halfMg / 20
  const format = (value: number) => value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")
  return `${format(halfMg)} mg(${format(halfMl)} mL)`
}

interface SolventDoseDisplay {
  text: string
  calculated: boolean
}

/** 항암제 라인 및 바로 아래 용매 라인에서 용매량과 계산값 여부를 함께 추출 */
function extractSolventDose(lines: RenderLine[], idx: number): SolventDoseDisplay | undefined {
  for (let i = idx; i <= idx + 3 && i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const red = (line.segments ?? [])
      .filter((s) => s.red)
      .map((s) => s.text)
      .join(" ")
    const hit = red.match(/[\d,]+(?:\.\d+)?\s*(mL|ml|cc)/)
    if (hit) return { text: hit[0], calculated: true }
  }

  // 고정 용매량은 표시하되 계산값이 아니므로 정상 글자색을 사용한다.
  for (let i = idx; i <= idx + 3 && i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const hit = lineText(line).match(/([\d,]+(?:\.\d+)?)\s*(mL|ml|cc|L)\b/)
    if (!hit) continue
    const value = Number.parseFloat(hit[1]!.replaceAll(",", ""))
    const unit = hit[2]!.toLowerCase()
    return {
      text: unit === "l" ? `${value * 1000} mL` : `${value} mL`,
      calculated: false,
    }
  }
  return undefined
}

/** 레지멘 annotation(`240 ch`)에서 hydration 속도 추출 */
function extractRateNote(lines: RenderLine[], idx: number): string | undefined {
  for (let i = idx; i <= idx + 2 && i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const src = `${line.annotation ?? ""} ${lineText(line)}`
    const hit = src.match(/([\d,]+(?:\.\d+)?)\s*(?:cc\/hr|ch)\b/i)
    if (hit) return `${hit[1]}ch`
  }
  return undefined
}

function anchorIndex(medId: string, lines: RenderLine[]): number {
  const sourceId = SOURCE_LINE_ID_BY_MED_ID[medId] ?? medId
  const direct = lines.findIndex((line) => line.id === sourceId)
  if (direct >= 0) return direct

  const entry = ANCHORS.find((a) => a.test(medId))
  if (!entry) return -1
  for (const kw of entry.keywords) {
    const idx = lines.findIndex((l) => (l.kind ?? "normal") !== "title" && lineText(l).includes(kw))
    if (idx >= 0) return idx
  }
  return -1
}

/** 표시 위치를 옮긴 오더도 용량·속도 계산은 자신의 원문 줄에서 읽는다. */
function calculationAnchorIndex(medId: string, lines: RenderLine[]): number {
  const direct = lines.findIndex((line) => line.id === medId)
  return direct >= 0 ? direct : anchorIndex(medId, lines)
}

export interface OrderWindowInput {
  regimenId: string | null
  day: number
  days: number[]
  calc: CalcResult
  doseOverrides: DoseOverrides
  settings: ScheduleSettings
  timeOverrides?: OrderTimeOverrides
}

export interface OrderWindow {
  rows: OrderWindowRow[]
  /** 해당 일자에 실제 처방되는 오더 */
  meds: OrderMedWithMeta[]
  /** 첫 항암 투약일인지 (동의서 질문 노출 조건) */
  isFirstDay: boolean
  /** 이 날짜가 실제 항암 투약일인지 */
  hasChemo: boolean
  /** 실제 첫 항암 투약일 */
  firstChemoDay: number | null
}

export function buildOrderWindow(input: OrderWindowInput): OrderWindow {
  const { regimenId, day, days, calc, doseOverrides, settings, timeOverrides = {} } = input
  const firstChemoDay = getFirstChemoDay(regimenId)
  const isFirstDay = firstChemoDay != null && day === firstChemoDay
  const hasChemo = hasChemoForDay(regimenId, day)
  const eff = effectiveSettings(settings, day, firstChemoDay ?? day)

  const sourceLines = addOrderOnlyLines(
    regimenId,
    day,
    buildRegimenLines(regimenId, calc, doseOverrides),
  )
  const lines = sourceLines.map(sanitizeLine)
  const rawMeds = getOrderMedsForDay(
    regimenId,
    day,
    eff,
    days,
    settings,
    timeOverrides,
  )

  // 레지멘 라인에서 총 용량 추출 후 OrderMed에 주입
  const meds = rawMeds.map((med) => {
    const idx = calculationAnchorIndex(med.id, sourceLines)
    const line = idx >= 0 ? sourceLines[idx] : undefined
    const doseText =
      line && med.id !== "acyclovir-tbi-cy"
        ? extractDoseText(line, med.id)
        : undefined
    const solventDose =
      idx >= 0 && med.solvent && med.id !== "etoposide-bucyeto"
        ? extractSolventDose(sourceLines, idx)
        : undefined
    const dynamicHydration = /^hydration-(high|low)-/.test(med.id)
    const rateNote = dynamicHydration && idx >= 0 ? extractRateNote(sourceLines, idx) : undefined
    const defaultTimes =
      rateNote && dynamicHydration
        ? getHydrationTimes(Number.parseFloat(rateNote.replaceAll(",", "")))
        : med.defaultTimes
    return {
      ...med,
      doseText,
      solventDoseText: solventDose?.text,
      solventDoseCalculated: solventDose?.calculated,
      rateNote,
      defaultTimes,
    }
  })


  // 라인별 오더 그룹
  const byIndex = new Map<number, OrderMedWithMeta[]>()
  const unmatched: OrderMedWithMeta[] = []
  for (const med of meds) {
    const idx = anchorIndex(med.id, sourceLines)
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

  return { rows, meds, isFirstDay, hasChemo, firstChemoDay }
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
