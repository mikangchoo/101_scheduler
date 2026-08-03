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

/** 동의서 응답은 첫 항암 투약일에만 적용 (이후 날짜는 기본 스케줄) */
export function effectiveSettings(
  settings: ScheduleSettings,
  day: number,
  firstDay: number,
): ScheduleSettings {
  if (day === firstDay) return settings
  return { ...DEFAULT_SCHEDULE_SETTINGS, consentReceived: true }
}

/** med id → 레지멘 라인 매칭 키워드 */
const ANCHORS: { test: (id: string) => boolean; keywords: string[] }[] = [
  { test: (id) => id.startsWith("thiotepa"), keywords: ["Thiotepa"] },
  { test: (id) => id.startsWith("busulfan"), keywords: ["Busulfan"] },
  { test: (id) => id.startsWith("levetiracetam"), keywords: ["Levetiracetam", "Keppra"] },
  { test: (id) => id === "ptcy", keywords: ["PTCy", "Cyclophosphamide"] },
  { test: (id) => id.startsWith("cyclophosphamide"), keywords: ["Cyclophosphamide"] },
  { test: (id) => id.startsWith("granisetron"), keywords: ["Serotonin antagonist", "Granisetron", "Antiemetics"] },
  { test: (id) => id.startsWith("mesna"), keywords: ["Mesna"] },
  { test: (id) => id.startsWith("hydration"), keywords: ["hydration", "Hydration", "cc/hr"] },
  { test: (id) => id.startsWith("furosemide"), keywords: ["furosemide", "Furosemide"] },
  { test: (id) => id.startsWith("citopcin"), keywords: ["Ciprofloxacin"] },
  { test: (id) => id.startsWith("ursa"), keywords: ["UDCA"] },
  { test: (id) => id.startsWith("mycamine"), keywords: ["Micafungin"] },
  { test: (id) => id.startsWith("zyprexa"), keywords: ["Olanzapine"] },
  { test: (id) => id.startsWith("melphalan"), keywords: ["Melphalan"] },
  { test: (id) => id.startsWith("dexamethasone"), keywords: ["dexamethasone", "Dexamethasone"] },
  { test: (id) => id.startsWith("fludarabine"), keywords: ["Fludarabine"] },
  { test: (id) => id === "atg", keywords: ["ATG (Rabbit", "ATG"] },
  { test: (id) => id.startsWith("mpred"), keywords: ["Methylprednisolone", "M-pred"] },
  { test: (id) => id.startsWith("acetaminophen"), keywords: ["Acetaminophen"] },
  { test: (id) => id.startsWith("chlorpheniramine"), keywords: ["Chlorpheniramine"] },
  { test: (id) => id.startsWith("hydrocortisone"), keywords: ["Hydrocortisone"] },
  { test: (id) => id.startsWith("tacrolimus"), keywords: ["Tacrolimus"] },
  { test: (id) => id.startsWith("mmf"), keywords: ["MMF", "Mycophenolate"] },
]

function lineText(line: RenderLine): string {
  if (line.segments) return line.segments.map((s) => s.text).join("")
  return line.text ?? ""
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

  const lines = buildRegimenLines(regimenId, calc, doseOverrides)
  const meds = getOrderMedsForDay(regimenId, day, eff)

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
    if ((line.kind ?? "normal") === "spacer") {
      rows.push({ kind: "regimen", key: `l${i}`, line })
      return
    }
    rows.push({ kind: "regimen", key: `l${i}`, line })
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
 * PRN order (모든 일자 공통) — PRN_order.png 기준
 * ------------------------------------------------------------------ */

export interface PrnOrder {
  id: string
  name: string
  detail: string
  badge: "PRN" | "TIT" | "SUP"
}

export const PRN_ORDERS: PrnOrder[] = [
  { id: "lasix", name: "Lasix inj 20mg (Furosemide)", detail: "20mg IV prn (I/O (+)1L 이상 시)", badge: "PRN" },
  { id: "meckool", name: "Meckool syr (Magnesium hydroxide)", detail: "30mL PO prn (변비 시)", badge: "PRN" },
  { id: "acetphen", name: "Acetphen tab 650mg (Acetaminophen)", detail: "650mg PO prn q6hr (fever/pain)", badge: "PRN" },
  { id: "tridol", name: "Tridol inj 50mg (Tramadol)", detail: "50mg + N/S 100mL MIV prn (pain)", badge: "TIT" },
  { id: "kanitron", name: "Kanitron tab 1mg (Ramosetron)", detail: "1mg PO prn (N/V)", badge: "PRN" },
  { id: "chlorph-prn", name: "Chlorpheniramine inj 4mg", detail: "4mg IVS prn (skin rash / itching)", badge: "PRN" },
  { id: "normal-saline", name: "0.9% N/S 100mL", detail: "IV side flushing prn", badge: "SUP" },
]
