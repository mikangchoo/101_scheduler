export interface RegimenOption {
  id: string
  label: string
  /** whether full regimen content is implemented */
  available: boolean
  /** contains Busulfan → show ABW25 on patient page */
  hasBusulfan: boolean
}

export interface RegimenCategory {
  id: string
  label: string
  regimens: RegimenOption[]
}

export const REGIMEN_CATEGORIES: RegimenCategory[] = [
  {
    id: "auto",
    label: "Auto",
    regimens: [
      { id: "hdmel", label: "HDMEL", available: true, hasBusulfan: false },
      { id: "bueam", label: "BuEAM", available: false, hasBusulfan: true },
      { id: "bucyeto", label: "BuCyEto", available: false, hasBusulfan: true },
      { id: "thiobucy", label: "ThioBuCy", available: true, hasBusulfan: true },
      { id: "bumel", label: "BuMel", available: false, hasBusulfan: true },
    ],
  },
  {
    id: "allo",
    label: "Allo",
    regimens: [
      { id: "buflubatg", label: "BuFluATG", available: true, hasBusulfan: true },
      { id: "buflu-ptcy", label: "Buflu-PTCy", available: true, hasBusulfan: true },
      { id: "tbi-cy", label: "TBI-Cy", available: false, hasBusulfan: false },
    ],
  },
  {
    id: "cart",
    label: "Car-T",
    regimens: [{ id: "fc", label: "FC", available: false, hasBusulfan: false }],
  },
]

export function findRegimen(id: string | null): RegimenOption | null {
  if (!id) return null
  for (const cat of REGIMEN_CATEGORIES) {
    const r = cat.regimens.find((x) => x.id === id)
    if (r) return r
  }
  return null
}

/** 카테고리 라벨을 포함한 표시용 이름 (예: "Allo - BuFluATG") */
export function getSelectedRegimenLabel(id: string | null): string | null {
  if (!id) return null
  for (const cat of REGIMEN_CATEGORIES) {
    const r = cat.regimens.find((x) => x.id === id)
    if (r) return `${cat.label} - ${r.label}`
  }
  return null
}

/** 레지멘이 속한 카테고리 id ("auto" | "allo" | "cart") */
export function getRegimenCategoryId(id: string | null): string | null {
  if (!id) return null
  for (const cat of REGIMEN_CATEGORIES) {
    if (cat.regimens.some((x) => x.id === id)) return cat.id
  }
  return null
}

/** 자가조혈모세포이식(auto) 레지멘 여부 — HDMEL, BuEAM, BuCyEto, ThioBuCy, BuMel */
export function isAutoRegimen(id: string | null): boolean {
  return getRegimenCategoryId(id) === "auto"
}

/** 동종(allo) 레지멘 여부 — BuFluATG, Buflu-PTCy, TBI-Cy */
export function isAlloRegimen(id: string | null): boolean {
  return getRegimenCategoryId(id) === "allo"
}

/** PTCy 포함 레지멘 여부 (G-CSF 시작일 분기 등) */
export function isPtCyRegimen(id: string | null): boolean {
  return id === "buflu-ptcy"
}

/* ------------------------------------------------------------------ *
 * Order-window medication model (used by components/order-med-row.tsx)
 * ------------------------------------------------------------------ */

export type ScheduleKind =
  | "thiotepa" // 시간 선택 드롭다운
  | "citopcin" // BID PO (더블클릭 편집)
  | "ursa" // TID PO (더블클릭 편집)
  | "chemo" // 항암제 (충돌 방지 스케줄러가 계산)
  | "mesna" // q6hr
  | "prn" // 시간 없음
  | "fixed"

export interface OrderMed {
  id: string
  /** OCS drug order line */
  name: string
  /** secondary line (dose / route / mix) */
  detail: string
  scheduleKind: ScheduleKind
  defaultTimes: string[]
  timeOptions?: string[]
  /** always-shown suffix, e.g. "F/ov1h", "얼음/ov1h" */
  suffix?: string
  /** 레지멘 라인에서 추출한 총 용량 (예: 166.0 mg) */
  doseText?: string
  /** 레지멘에서 계산된 용매 용량 (예: 300 mL) */
  solventDoseText?: string
  /** 수행시간 첫 칸에 표기할 주입 속도 (예: 240cc/hr) */
  rateNote?: string
  /** 마지막 투약 시간 뒤 (end) 표기 */
  endMark?: boolean
}
