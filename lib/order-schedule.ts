import type { OrderMed } from "@/lib/regimens"
import {
  fromMinutes,
  getBidOralTimes,
  getChemoStartTime,
  getMycamineTime,
  getQdOralTime,
  getTidOralTimes,
  toMinutes,
  type ScheduleSettings,
} from "@/lib/schedule-settings"

/* ---------------- Conditioning day list ---------------- */

export const CONDITIONING_DAYS: number[] = [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 3, 4]

export function formatDay(day: number): string {
  if (day === 0) return "D0"
  return day > 0 ? `D+${day}` : `D${day}`
}

/* ------------------------------------------------------------------ *
 * Legacy PO edit helpers (더블클릭 메뉴)
 * ------------------------------------------------------------------ */

export function applyCitopcinEdit(action: "12:00" | "delete"): string[] {
  if (action === "12:00") return ["12:00", "22:00"]
  return ["20:00"]
}

export function applyUrsaEdit(action: "12:00" | "18:00"): string[] {
  if (action === "12:00") return ["12:00", "18:00", "22:00"]
  return ["18:00", "22:00"]
}

/* ------------------------------------------------------------------ *
 * Medication definition model
 * ------------------------------------------------------------------ */

type TimeRule =
  /** 항암제 — 스케줄러가 충돌 없이 순차 배치 (짧은 정주시간 우선) */
  | { type: "chemo"; durationMin: number; order?: number }
  /** 특정 항암제 기준 상대시간 (음수 = 이전) */
  | { type: "relative"; ref: string; offsetMin: number; repeatEveryMin?: number; count?: number }
  /** Cyclophosphamide 기준 -30분부터 q6hr */
  | { type: "mesna"; ref: string }
  /** 고정 시간 (shift 영향 없음) */
  | { type: "fixed"; times: string[] }
  /** PO 규칙 (shift 영향) */
  | { type: "oral"; freq: "bid" | "tid" | "qd"; base?: string }
  /** Mycamine */
  | { type: "mycamine" }
  /** 수액 교환 (rate 기반 grid) */
  | { type: "hydration"; rateCcHr: number }
  /** PRN */
  | { type: "prn" }
  /** 시간 선택 드롭다운 (Thiotepa) */
  | { type: "select"; options: string[]; defaultTime: string }

interface MedDef {
  id: string
  name: string
  detail: string
  /** 표시용 suffix (얼음/차광/정주시간 등) */
  suffix?: string
  /** SUP(수액/보조) 뱃지 */
  sup?: boolean
  /** 기울임 안내문 */
  note?: string
  /** 투약 일자 */
  days: number[]
  rule: TimeRule
  /** 표시 순서 */
  sort?: number
}

/* ------------------------------------------------------------------ *
 * Time helpers
 * ------------------------------------------------------------------ */

export function getHydrationTimes(rateCcHr: number): string[] {
  const hoursPerBag = 1000 / rateCcHr
  const snap = Math.round(hoursPerBag / 2) * 2
  const interval = Math.max(4, Math.min(8, snap))
  const anchors: Record<number, number[]> = {
    4: [0, 4, 8, 12, 16, 20],
    6: [0, 6, 12, 18],
    8: [0, 8, 16],
  }
  return (anchors[interval] ?? anchors[6]!).map((h) => fromMinutes(h * 60))
}

/** Mesna q6hr — CTX 시작 30분 전부터 6시간 간격 4회 (24시 넘으면 익일 표기) */
export function getMesnaTimes(ctxStartMin: number): string[] {
  const first = ctxStartMin - 30
  const out: string[] = []
  for (let i = 0; i < 4; i++) {
    const t = first + i * 360
    out.push(t >= 1440 ? `${fromMinutes(t)}(익일)` : fromMinutes(t))
  }
  return out
}

/* ============================================================ *
 * ThioBuCy  (D-8 → D0)
 * ============================================================ */
const THIOBUCY_MEDS: MedDef[] = [
  {
    id: "thiotepa",
    name: "Tepadina inj (Thiotepa)",
    detail: "[IV] <Mix> x1 · miv over 60min (0.22μm filter)",
    suffix: "F/ov1h",
    days: [-8, -7, -6],
    sort: 10,
    rule: {
      type: "select",
      defaultTime: "11:00",
      options: ["11:00", "12:00", "13:00", "14:00", "15:00", "16:30", "17:30", "18:30"],
    },
  },
  {
    id: "busulfan",
    name: "IV Busulfan inj (Busulfan)",
    detail: "[MIV] <Mix> qd · miv over 3hrs",
    suffix: "ov3h",
    days: [-5, -4],
    sort: 10,
    note: "Sz prophylaxis: Levetiracetam 1500mg po loading 3–4hrs before (D-5), 이후 500mg bid",
    rule: { type: "chemo", durationMin: 180 },
  },
  {
    id: "levetiracetam",
    name: "Levetiracetam tab (Keppra)",
    detail: "[P.O] · Sz prophylaxis",
    days: [-5, -4, -3],
    sort: 60,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "cyclophosphamide",
    name: "Cyclophosphamide inj",
    detail: "[MIV] <Mix> · miv over 1hr",
    suffix: "얼음/ov1h",
    days: [-3, -2],
    sort: 10,
    rule: { type: "chemo", durationMin: 60 },
  },
  {
    id: "granisetron-ctx",
    name: "Granisetron inj 3mg (Kytril)",
    detail: "[IV] qd · 단독",
    note: "항암제 시작 30분 전",
    days: [-3, -2],
    sort: 5,
    rule: { type: "relative", ref: "cyclophosphamide", offsetMin: -30 },
  },
  {
    id: "mesna",
    name: "Mesna inj 1000mg",
    detail: "[MIV] NS50ml · q6hr",
    note: "Cyclophosphamide 시작 30분 전 → q6hr (익일분 포함)",
    days: [-3, -2],
    sort: 20,
    rule: { type: "mesna", ref: "cyclophosphamide" },
  },
  {
    id: "hydration",
    name: "Dextrose 5% Na K2 1L (NaK2V)",
    detail: "[IV] D5WNa77K20 · 3L/m²/day",
    sup: true,
    days: [-3, -2, -1, 0],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "furosemide",
    name: "Furosemide inj 10mg",
    detail: "[IV] q6h PRN",
    note: "if 6hr u/o < 1L or 150ml/hr",
    days: [-3, -2, -1, 0],
    sort: 85,
    rule: { type: "prn" },
  },
  {
    id: "citopcin",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    days: [-8, -7, -6, -5, -4, -3, -2, -1, 0],
    sort: 70,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "ursa",
    name: "Ursa 200mg tab (UDCA)",
    detail: "1 tab [P.O] tid",
    days: [-7, -6, -5, -4, -3, -2, -1, 0],
    sort: 71,
    rule: { type: "oral", freq: "tid" },
  },
  {
    id: "mycamine",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    days: [-8, -7, -6, -5, -4, -3, -2, -1, 0],
    sort: 75,
    rule: { type: "mycamine" },
  },
  {
    id: "zyprexa",
    name: "Zyprexa 10mg tab (Olanzapine)",
    detail: "1 tab [P.O] daily hs [D]",
    days: [-8, -7, -6],
    sort: 90,
    rule: { type: "fixed", times: ["21:00"] },
  },
]

/* ============================================================ *
 * HDMEL
 * ============================================================ */
const HDMEL_MEDS: MedDef[] = [
  {
    id: "melphalan",
    name: "Alkeran inj (Melphalan)",
    detail: "[MIV] NS500ml · miv over 30min",
    suffix: "얼음/차광/ov30m",
    days: [-3, -2],
    sort: 10,
    rule: { type: "chemo", durationMin: 30 },
  },
  {
    id: "granisetron-mel",
    name: "Granisetron inj 3mg (Kytril)",
    detail: "[IV] qd · 단독",
    note: "항암제 시작 30분 전",
    days: [-3, -2],
    sort: 5,
    rule: { type: "relative", ref: "melphalan", offsetMin: -30 },
  },
  {
    id: "dexamethasone-mel",
    name: "Dexamethasone inj 10mg",
    detail: "[IVS] · premed",
    days: [-3, -2],
    sort: 6,
    rule: { type: "relative", ref: "melphalan", offsetMin: -30 },
  },
  {
    id: "hyd-pre-mel",
    name: "Dextrose 5% Na K2 1L (NaK2V)",
    detail: "[IV] 250 cc/hr → +12hr 이후 75 cc/hr",
    sup: true,
    note: "Melphalan 기준 -6시간부터 hydration 시작",
    days: [-3, -2],
    sort: 80,
    rule: { type: "relative", ref: "melphalan", offsetMin: -360, repeatEveryMin: 240, count: 3 },
  },
  {
    id: "furosemide-mel",
    name: "Furosemide inj 20mg",
    detail: "[IVS] · +1hr after Mel",
    days: [-3, -2],
    sort: 30,
    rule: { type: "relative", ref: "melphalan", offsetMin: 60 },
  },
  {
    id: "citopcin-hdmel",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    days: [-3, -2, -1, 0],
    sort: 70,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "mycamine-hdmel",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    days: [-3, -2, -1, 0],
    sort: 75,
    rule: { type: "mycamine" },
  },
]

/* ============================================================ *
 * BuFluATG
 * ============================================================ */
const BUFLUBATG_MEDS: MedDef[] = [
  {
    id: "fludarabine",
    name: "Fludara inj (Fludarabine)",
    detail: "[MIV] NS100ml · miv over 30min",
    suffix: "ov30m",
    days: [-6, -5, -4, -3],
    sort: 10,
    rule: { type: "chemo", durationMin: 30 },
  },
  {
    id: "busulfan-batg",
    name: "IV Busulfan inj (Busulfan)",
    detail: "[MIV] <Mix> · miv over 3hrs",
    suffix: "ov3h",
    note: "Fludarabine 종료 후 연속 투약 (동시 투약 불가)",
    days: [-6, -5, -4, -3],
    sort: 11,
    rule: { type: "chemo", durationMin: 180 },
  },
  {
    id: "levetiracetam-batg",
    name: "Levetiracetam tab (Keppra)",
    detail: "[P.O] · Sz prophylaxis",
    note: "Busulfan 3–4시간 전 loading 1500mg (D-6), 이후 500mg bid",
    days: [-6, -5, -4, -3, -2],
    sort: 60,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "granisetron-batg",
    name: "Granisetron inj 3mg (Kytril)",
    detail: "[IV] qd · 단독",
    note: "항암제 시작 30분 전",
    days: [-6, -5, -4, -3],
    sort: 5,
    rule: { type: "relative", ref: "fludarabine", offsetMin: -30 },
  },
  {
    id: "atg",
    name: "Thymoglobulin (ATG, Rabbit)",
    detail: "[MIV] NS · miv over 6hrs via I-med",
    suffix: "ov6h",
    note: "1.5mg/kg/day (matched related) · 2.5mg/kg/day (unrelated/mismatched)",
    days: [-3, -2, -1],
    sort: 12,
    rule: { type: "chemo", durationMin: 360 },
  },
  {
    id: "mpred",
    name: "Methylprednisolone inj",
    detail: "[IV] D5W 100ml · over 30min q12hr",
    note: "Thymoglobulin premedication (1mg/kg q12hr)",
    days: [-3, -2, -1],
    sort: 61,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "acetaminophen-atg",
    name: "Acetaminophen tab 600mg",
    detail: "[P.O] · ATG premed -1hr",
    days: [-3, -2, -1],
    sort: 62,
    rule: { type: "relative", ref: "atg", offsetMin: -60 },
  },
  {
    id: "chlorpheniramine-atg",
    name: "Chlorpheniramine inj 4mg",
    detail: "[IV] · ATG premed -30min",
    days: [-3, -2, -1],
    sort: 63,
    rule: { type: "relative", ref: "atg", offsetMin: -30 },
  },
  {
    id: "hydrocortisone-atg",
    name: "Hydrocortisone inj 50mg",
    detail: "[IV] · ATG +30min",
    days: [-3, -2, -1],
    sort: 64,
    rule: { type: "relative", ref: "atg", offsetMin: 30 },
  },
  {
    id: "hydration-batg",
    name: "Dextrose 5% Na K2 1L (NaK2V)",
    detail: "[IV] 125 cc/hr",
    sup: true,
    days: [-6, -5, -4, -3],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "citopcin-batg",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    days: [-6, -5, -4, -3, -2, -1, 0],
    sort: 70,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "ursa-batg",
    name: "Ursa 200mg tab (UDCA)",
    detail: "1 tab [P.O] tid",
    days: [-6, -5, -4, -3, -2, -1, 0],
    sort: 71,
    rule: { type: "oral", freq: "tid" },
  },
  {
    id: "mycamine-batg",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    days: [-6, -5, -4, -3, -2, -1, 0],
    sort: 75,
    rule: { type: "mycamine" },
  },
]

/* ============================================================ *
 * BuFlu-PTCy  (컨디셔닝 D-6~D-2, PTCy D+3/D+4)
 * ============================================================ */
const BUFLU_PTCY_MEDS: MedDef[] = [
  {
    id: "fludarabine-ptcy",
    name: "Fludara inj (Fludarabine)",
    detail: "[MIV] NS100ml · miv over 30min",
    suffix: "ov30m",
    days: [-6, -5, -4, -3, -2],
    sort: 10,
    rule: { type: "chemo", durationMin: 30 },
  },
  {
    id: "busulfan-ptcy",
    name: "IV Busulfan inj (Busulfan)",
    detail: "[MIV] <Mix> · miv over 3hrs",
    suffix: "ov3h",
    note: "Fludarabine 종료 후 연속 투약",
    days: [-5, -4, -3, -2],
    sort: 11,
    rule: { type: "chemo", durationMin: 180 },
  },
  {
    id: "levetiracetam-ptcy",
    name: "Levetiracetam tab (Keppra)",
    detail: "[P.O] · Sz prophylaxis",
    days: [-6, -5, -4, -3, -2],
    sort: 60,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "granisetron-ptcy",
    name: "Granisetron inj 3mg (Kytril)",
    detail: "[IV] qd · 단독",
    note: "항암제 시작 30분 전",
    days: [-6, -5, -4, -3, -2],
    sort: 5,
    rule: { type: "relative", ref: "fludarabine-ptcy", offsetMin: -30 },
  },
  {
    id: "ptcy",
    name: "Cyclophosphamide inj (PTCy)",
    detail: "50 mg/kg [MIV] <Mix> · miv over 1hr",
    suffix: "얼음/ov1h",
    note: "D+3, D+4 (stem cell infusion 후 72시간)",
    days: [3, 4],
    sort: 10,
    rule: { type: "chemo", durationMin: 60 },
  },
  {
    id: "granisetron-ptcy-post",
    name: "Granisetron inj 3mg (Kytril)",
    detail: "[IV] qd · 단독",
    days: [3, 4],
    sort: 5,
    rule: { type: "relative", ref: "ptcy", offsetMin: -30 },
  },
  {
    id: "mesna-ptcy",
    name: "Mesna inj 1000mg",
    detail: "[MIV] NS50ml · q6hr",
    note: "PTCy 시작 30분 전 → q6hr (익일분 포함)",
    days: [3, 4],
    sort: 20,
    rule: { type: "mesna", ref: "ptcy" },
  },
  {
    id: "hydration-ptcy",
    name: "Dextrose 5% Na K2 1L (NaK2V)",
    detail: "[IV] 125 cc/hr",
    sup: true,
    days: [-6, -5, -4, -3, -2, 3, 4],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "furosemide-ptcy",
    name: "Furosemide inj 10mg",
    detail: "[IV] q6h PRN",
    note: "if 6hr u/o < 1L or 150ml/hr",
    days: [3, 4],
    sort: 85,
    rule: { type: "prn" },
  },
  {
    id: "tacrolimus-ptcy",
    name: "Tacrolimus inj (Prograf)",
    detail: "0.02 mg/kg/day [MIV] continuous · D+5부터",
    note: "GVHD prophylaxis (CNI) — PTCy 종료 후 개시",
    days: [4],
    sort: 65,
    rule: { type: "fixed", times: ["09:00"] },
  },
  {
    id: "mmf-ptcy",
    name: "Mycophenolate mofetil cap 500mg",
    detail: "15 mg/kg [P.O] tid · D+5 ~ D+35",
    days: [4],
    sort: 66,
    rule: { type: "oral", freq: "tid" },
  },
  {
    id: "citopcin-ptcy",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    days: [-6, -5, -4, -3, -2, -1, 0, 3, 4],
    sort: 70,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "ursa-ptcy",
    name: "Ursa 200mg tab (UDCA)",
    detail: "1 tab [P.O] tid",
    days: [-6, -5, -4, -3, -2, -1, 0, 3, 4],
    sort: 71,
    rule: { type: "oral", freq: "tid" },
  },
  {
    id: "mycamine-ptcy",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    days: [-6, -5, -4, -3, -2, -1, 0, 3, 4],
    sort: 75,
    rule: { type: "mycamine" },
  },
]

/* ============================================================ *
 * Registry
 * ============================================================ */
const REGIMEN_MEDS: Record<string, MedDef[]> = {
  thiobucy: THIOBUCY_MEDS,
  hdmel: HDMEL_MEDS,
  buflubatg: BUFLUBATG_MEDS,
  "buflu-ptcy": BUFLU_PTCY_MEDS,
}

export function getOrderDaysForRegimen(regimenId: string | null): number[] {
  const meds = regimenId ? REGIMEN_MEDS[regimenId] : null
  if (!meds) return CONDITIONING_DAYS
  const set = new Set<number>()
  meds.forEach((m) => m.days.forEach((d) => set.add(d)))
  return [...set].sort((a, b) => a - b)
}

export interface OrderMedWithMeta extends OrderMed {
  note?: string
  sup?: boolean
}

/* ------------------------------------------------------------------ *
 * Scheduler
 *  1) 해당 일자 항암제를 정주시간 짧은 순으로 배치 (겹치지 않게 순차)
 *  2) relative / mesna 는 기준 항암제 시간에서 계산
 *  3) PO·Mycamine 은 동의서 shift 규칙 적용
 * ------------------------------------------------------------------ */

function scheduleChemo(meds: MedDef[], settings: ScheduleSettings): Record<string, number> {
  const start = toMinutes(getChemoStartTime(settings))
  const chemo = meds
    .filter((m) => m.rule.type === "chemo")
    .sort((a, b) => {
      const ra = a.rule as Extract<TimeRule, { type: "chemo" }>
      const rb = b.rule as Extract<TimeRule, { type: "chemo" }>
      if ((ra.order ?? 0) !== (rb.order ?? 0)) return (ra.order ?? 0) - (rb.order ?? 0)
      return ra.durationMin - rb.durationMin
    })

  const at: Record<string, number> = {}
  let cursor = start
  for (const m of chemo) {
    const rule = m.rule as Extract<TimeRule, { type: "chemo" }>
    at[m.id] = cursor
    cursor += rule.durationMin // 충돌 방지: 종료 후 다음 약 시작
  }

  // Thiotepa (select) 도 기준 시각으로 등록
  for (const m of meds) {
    if (m.rule.type === "select") at[m.id] = toMinutes(m.rule.defaultTime)
  }
  return at
}

function resolveTimes(med: MedDef, anchors: Record<string, number>, settings: ScheduleSettings): string[] {
  const rule = med.rule
  switch (rule.type) {
    case "chemo":
      return [fromMinutes(anchors[med.id] ?? toMinutes(getChemoStartTime(settings)))]
    case "select":
      return [rule.defaultTime]
    case "relative": {
      const base = anchors[rule.ref]
      if (base == null) return []
      const count = rule.count ?? 1
      const step = rule.repeatEveryMin ?? 0
      return Array.from({ length: count }, (_, i) => fromMinutes(base + rule.offsetMin + i * step))
    }
    case "mesna": {
      const base = anchors[rule.ref]
      if (base == null) return []
      return getMesnaTimes(base)
    }
    case "fixed":
      return rule.times
    case "oral":
      if (rule.freq === "bid") return getBidOralTimes(settings)
      if (rule.freq === "tid") return getTidOralTimes(settings)
      return [getQdOralTime(settings, rule.base)]
    case "mycamine":
      return [getMycamineTime(settings)]
    case "hydration":
      return getHydrationTimes(rule.rateCcHr)
    case "prn":
      return ["PRN"]
  }
}

function displayKind(med: MedDef): OrderMed["scheduleKind"] {
  switch (med.rule.type) {
    case "select":
      return "thiotepa"
    case "chemo":
      return "chemo"
    case "mesna":
      return "mesna"
    case "prn":
      return "prn"
    case "oral":
      if (med.id.startsWith("citopcin")) return "citopcin"
      if (med.id.startsWith("ursa")) return "ursa"
      return "fixed"
    default:
      return "fixed"
  }
}

export function getOrderMedsForDay(
  regimenId: string | null,
  day: number,
  settings: ScheduleSettings,
): OrderMedWithMeta[] {
  if (!regimenId) return []
  const all = REGIMEN_MEDS[regimenId]
  if (!all) return []

  const todays = all.filter((m) => m.days.includes(day))
  const anchors = scheduleChemo(todays, settings)

  return todays
    .slice()
    .sort((a, b) => (a.sort ?? 50) - (b.sort ?? 50))
    .map((m) => ({
      id: m.id,
      name: m.name,
      detail: m.detail,
      suffix: m.suffix,
      note: m.note,
      sup: m.sup,
      scheduleKind: displayKind(m),
      defaultTimes: resolveTimes(m, anchors, settings),
      timeOptions: m.rule.type === "select" ? m.rule.options : undefined,
    }))
}
