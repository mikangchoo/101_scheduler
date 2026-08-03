import type { OrderMed } from "@/lib/regimens"

/* ---------------- Conditioning day list ---------------- */

/** D-9 ... D0 */
export const CONDITIONING_DAYS: number[] = [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0]

export function formatDay(day: number): string {
  return day === 0 ? "D0" : `D${day}`
}

/* ------------------------------------------------------------------ *
 * Schedule editing helpers
 * ------------------------------------------------------------------ */

/**
 * Citopcin BID oral.
 * Default 08:00 / 20:00.
 * After chemo-start shift:
 *   - 13:00 → 12:00 / 18:00 / 22:00 (extra dose)
 *   - 16:30 → 18:00 / 22:00
 */
export function applyCitopcinEdit(action: "12:00" | "delete"): string[] {
  if (action === "12:00") return ["12:00", "22:00"]
  return ["20:00"]
}

/**
 * Ursa TID oral.
 * Default 08:00 / 12:00 / 18:00.
 * After shift:
 *   - 13:00 → 12:00 / 18:00 / 22:00
 *   - 16:30 → 18:00 / 22:00
 */
export function applyUrsaEdit(action: "12:00" | "18:00"): string[] {
  if (action === "12:00") return ["12:00", "18:00", "22:00"]
  return ["18:00", "22:00"]
}

/* ------------------------------------------------------------------ *
 * Scheduling helpers
 * ------------------------------------------------------------------ */

/** Zero-pad to HH:MM */
function hhmm(h: number, m = 0): string {
  return `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor(m)).padStart(2, "0")}`
}

/** Mesna q6h grid anchored to first Cyclophosphamide time -30 min.
 *  Returns up to 4 times: pre-CTX -30min, then +6h, +12h, +18h.
 *  Times that cross midnight (≥24:00) are flagged as next-day.
 */
export function getMesnaTimesForCtx(ctxStartHour: number): { times: string[]; nextDayTimes: string[] } {
  const firstMesnaHour = ctxStartHour - 0.5 // 30 min before
  const times: string[] = []
  const nextDayTimes: string[] = []
  for (let i = 0; i < 4; i++) {
    const h = firstMesnaHour + i * 6
    if (h < 24) {
      times.push(hhmm(h))
    } else {
      nextDayTimes.push(hhmm(h - 24))
    }
  }
  return { times, nextDayTimes }
}

/** Antiemetic (Granisetron 3mg) — 30 min before chemo start */
export function getAntiemeticTime(chemoStartHour: number): string {
  return hhmm(chemoStartHour - 0.5)
}

/** Hydration bag times (1 bag = 1 L).
 *  Rate cc/hr → exchange interval in hours (snapped to nearest integer).
 *  Grid anchors: q4→0,4,8,12,16,20  q6→0,6,12,18  q8→0,8,16
 */
export function getHydrationTimes(rateCcHr: number): string[] {
  const litersPerDay = (rateCcHr * 24) / 1000
  const hoursPerBag = 1000 / rateCcHr
  // Snap to nearest even integer (4, 6, 8, …)
  const snap = Math.round(hoursPerBag / 2) * 2
  const interval = Math.max(4, Math.min(8, snap))
  const anchors: Record<number, number[]> = {
    4: [0, 4, 8, 12, 16, 20],
    6: [0, 6, 12, 18],
    8: [0, 8, 16],
  }
  return (anchors[interval] ?? anchors[6]).map((h) => hhmm(h))
}

/** Pre-melphalan hydration: 250 cc/hr from -6hr to chemo start, then 75cc/hr after +12hr */
export function getMelphalanHydrationTimes(chemoStartHour: number): { pre: string; slow: string } {
  const pre = hhmm(chemoStartHour - 6)
  const slow = hhmm(chemoStartHour + 12)
  return { pre, slow }
}

/* ------------------------------------------------------------------ *
 * Day → medication mapping
 * ------------------------------------------------------------------ */

interface MedDef extends OrderMed {
  /** conditioning days this med is administered on */
  days: number[]
  /** optional note shown in italics below the med row */
  note?: string
  /** SUP label (hydration/supportive) */
  sup?: boolean
}

/* ============================================================ *
 * ThioBuCy  (D-8 → D0)
 * ============================================================ */
const THIOBUCY_MEDS: MedDef[] = [
  {
    id: "thiotepa",
    name: "Tepadina inj (Thiotepa)",
    detail: "[IV] <Mix> x1  ·  miv over 60min (0.22μm filter)",
    scheduleKind: "thiotepa",
    defaultTimes: ["11:00"],
    timeOptions: ["11:00", "12:00", "13:00", "14:00", "15:00", "16:30", "17:30", "18:30"],
    suffix: "F/ov1h",
    days: [-8, -7, -6],
  },
  {
    id: "busulfan",
    name: "IV Busulfan inj (Busulfan)",
    detail: "[MIV] <Mix> qd  ·  miv over 3hrs",
    scheduleKind: "fixed",
    defaultTimes: ["09:00"],
    note: "with Sz prophylaxis: Levetiracetam 1500mg po loading 3-4hrs before (D-5), then 500mg bid (D-4~D-3)",
    days: [-5, -4],
  },
  {
    id: "levetiracetam",
    name: "Levetiracetam tab (Keppra)",
    detail: "[P.O]  ·  Sz prophylaxis",
    scheduleKind: "fixed",
    defaultTimes: ["08:00", "20:00"],
    days: [-5, -4, -3],
  },
  {
    id: "cyclophosphamide",
    name: "Cyclophosphamide inj",
    detail: "[MIV] <Mix>  ·  miv over 1hr",
    scheduleKind: "chemo",
    defaultTimes: ["11:00"],
    suffix: "얼음/ov1h",
    days: [-3, -2],
  },
  {
    id: "granisetron-ctx",
    name: "Granisetron inj 3mg (Kytril)",
    detail: "[IV] qd  ·  단독",
    scheduleKind: "fixed",
    defaultTimes: ["10:30"],
    note: "항암제 시작 30분 전",
    days: [-3, -2],
  },
  {
    id: "mesna",
    name: "Mesna inj 1000mg",
    detail: "[MIV] NS50ml  ·  q6h",
    scheduleKind: "mesna",
    defaultTimes: ["10:30", "16:30", "22:30"],
    note: "Cyclophosphamide 시작 30분 전 → q6hr",
    days: [-3, -2],
  },
  {
    id: "mesna-next",
    name: "Mesna inj 1000mg",
    detail: "[MIV] NS50ml  ·  (전일서명)",
    scheduleKind: "fixed",
    defaultTimes: ["04:30"],
    note: "전일 오더 연장분 — 다음날 05:00 투약",
    days: [-3, -2],
  },
  {
    id: "hydration",
    name: "Dextrose 5% Na K2 1L (NaK2V)",
    detail: "[IV] D5WNa77K20  ·  SUP",
    scheduleKind: "fixed",
    defaultTimes: ["00:00", "06:00", "12:00", "18:00"],
    sup: true,
    note: "3L/m²/day (D-3~D0)",
    days: [-3, -2, -1, 0],
  },
  {
    id: "furosemide",
    name: "Furosemide inj 10mg",
    detail: "[IV] q6h PRN",
    scheduleKind: "fixed",
    defaultTimes: ["PRN"],
    note: "if 6hr u/o < 1L or 150ml/hr",
    days: [-3, -2, -1, 0],
  },
  {
    id: "citopcin",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    scheduleKind: "citopcin",
    defaultTimes: ["08:00", "20:00"],
    days: [-8, -7, -6, -5, -4, -3, -2, -1, 0],
  },
  {
    id: "ursa",
    name: "Ursa 200mg tab (UDCA)",
    detail: "1 tab [P.O] tid",
    scheduleKind: "ursa",
    defaultTimes: ["08:00", "12:00", "18:00"],
    days: [-7, -6, -5, -4, -3, -2, -1, 0],
  },
  {
    id: "mycamine",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    scheduleKind: "fixed",
    defaultTimes: ["16:00"],
    days: [-8, -7, -6, -5, -4, -3, -2, -1, 0],
  },
  {
    id: "zyprexa",
    name: "Zyprexa 10mg tab (Olanzapine)",
    detail: "1 tab [P.O] daily hs [D]",
    scheduleKind: "fixed",
    defaultTimes: ["21:00"],
    days: [-8, -7, -6],
  },
]

/* ============================================================ *
 * HDMEL  (D-3, D-2 chemo; D0 transplant)
 * ============================================================ */
const HDMEL_MEDS: MedDef[] = [
  {
    id: "melphalan",
    name: "Alkeran inj (Melphalan)",
    detail: "[MIV] NS500ml  ·  miv over 30min",
    scheduleKind: "chemo",
    defaultTimes: ["11:00"],
    suffix: "얼음/차광/ov30m",
    days: [-3, -2],
  },
  {
    id: "granisetron-mel",
    name: "Granisetron inj 3mg (Kytril)",
    detail: "[IV] qd  ·  단독",
    scheduleKind: "fixed",
    defaultTimes: ["10:30"],
    note: "항암제 시작 30분 전",
    days: [-3, -2],
  },
  {
    id: "dexamethasone-mel",
    name: "Dexamethasone inj 10mg",
    detail: "[IVS]  ·  premed -30min before Mel",
    scheduleKind: "fixed",
    defaultTimes: ["10:30"],
    days: [-3, -2],
  },
  {
    id: "hyd-pre-mel",
    name: "Dextrose 5% Na K2 1L (NaK2V)",
    detail: "[IV] 250 cc/hr  ·  -6hr before Mel · SUP",
    scheduleKind: "fixed",
    defaultTimes: ["05:00"],
    sup: true,
    note: "Melphalan 기준 -6시간부터 +12시간, 250cc/hr → 75cc/hr 유지",
    days: [-3, -2],
  },
  {
    id: "furosemide-mel",
    name: "Furosemide inj 20mg",
    detail: "[IVS]  ·  +1hr after Mel",
    scheduleKind: "fixed",
    defaultTimes: ["12:00"],
    days: [-3, -2],
  },
  {
    id: "citopcin-hdmel",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    scheduleKind: "citopcin",
    defaultTimes: ["08:00", "20:00"],
    days: [-3, -2, -1, 0],
  },
  {
    id: "mycamine-hdmel",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    scheduleKind: "fixed",
    defaultTimes: ["16:00"],
    days: [-3, -2, -1, 0],
  },
]

/* ============================================================ *
 * BuFluATG  (D-6 ~ D0)
 * ============================================================ */
const BUFLUBATG_MEDS: MedDef[] = [
  {
    id: "fludarabine",
    name: "Fludara inj (Fludarabine)",
    detail: "[MIV] NS100ml  ·  miv over 1hr",
    scheduleKind: "chemo",
    defaultTimes: ["09:00"],
    suffix: "ov1h",
    days: [-6, -5, -4, -3],
  },
  {
    id: "busulfan-batg",
    name: "IV Busulfan inj (Busulfan)",
    detail: "[MIV] <Mix>  ·  miv over 3hrs",
    scheduleKind: "chemo",
    defaultTimes: ["11:00"],
    suffix: "ov3h",
    note: "Fludarabine 완료 후 시작 (하루 1번)",
    days: [-6, -5, -4, -3],
  },
  {
    id: "levetiracetam-batg",
    name: "Levetiracetam tab (Keppra)",
    detail: "[P.O]  ·  Sz prophylaxis",
    scheduleKind: "fixed",
    defaultTimes: ["08:00", "20:00"],
    note: "Busulfan 투약 3-4시간 전 loading 1500mg (D-6), 이후 500mg bid (D-5~D-2)",
    days: [-6, -5, -4, -3, -2],
  },
  {
    id: "granisetron-batg",
    name: "Granisetron inj 3mg (Kytril)",
    detail: "[IV] qd  ·  단독",
    scheduleKind: "fixed",
    defaultTimes: ["08:30"],
    note: "항암제 시작 30분 전",
    days: [-6, -5, -4, -3],
  },
  {
    id: "atg",
    name: "Thymoglobulin (ATG, Rabbit)",
    detail: "[MIV] NS  ·  miv over 6hrs via I-med",
    scheduleKind: "chemo",
    defaultTimes: ["13:00"],
    suffix: "ov6h",
    note: "1.5mg/kg/day (matched related) · 2.5mg/kg/day (unrelated/mismatched)",
    days: [-3, -2, -1],
  },
  {
    id: "mpred",
    name: "Methylprednisolone inj",
    detail: "[IV] D5W 100ml  ·  over 30min q12hr",
    scheduleKind: "fixed",
    defaultTimes: ["08:00", "20:00"],
    note: "Thymoglobulin premedication (1mg/kg q12hr = 2mg/kg/day)",
    days: [-3, -2, -1],
  },
  {
    id: "acetaminophen-atg",
    name: "Acetaminophen tab 600mg",
    detail: "[P.O]  ·  ATG premed -1hr",
    scheduleKind: "fixed",
    defaultTimes: ["12:00"],
    days: [-3, -2, -1],
  },
  {
    id: "chlorpheniramine-atg",
    name: "Chlorpheniramine inj 4mg",
    detail: "[IV]  ·  ATG premed -30min",
    scheduleKind: "fixed",
    defaultTimes: ["12:30"],
    days: [-3, -2, -1],
  },
  {
    id: "hydrocortisone-atg",
    name: "Hydrocortisone inj 50mg",
    detail: "[IV]  ·  ATG +30min",
    scheduleKind: "fixed",
    defaultTimes: ["13:30"],
    days: [-3, -2, -1],
  },
  {
    id: "hydration-batg",
    name: "Dextrose 5% Na K2 1L (NaK2V)",
    detail: "[IV] 125 cc/hr  ·  SUP",
    scheduleKind: "fixed",
    defaultTimes: ["00:00", "08:00", "16:00"],
    sup: true,
    note: "125cc/hr D-6~D-3, then tapering",
    days: [-6, -5, -4, -3],
  },
  {
    id: "citopcin-batg",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    scheduleKind: "citopcin",
    defaultTimes: ["08:00", "20:00"],
    days: [-6, -5, -4, -3, -2, -1, 0],
  },
  {
    id: "ursa-batg",
    name: "Ursa 200mg tab (UDCA)",
    detail: "1 tab [P.O] tid",
    scheduleKind: "ursa",
    defaultTimes: ["08:00", "12:00", "18:00"],
    days: [-6, -5, -4, -3, -2, -1, 0],
  },
  {
    id: "mycamine-batg",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    scheduleKind: "fixed",
    defaultTimes: ["16:00"],
    days: [-6, -5, -4, -3, -2, -1, 0],
  },
]

/* ============================================================ *
 * Registry
 * ============================================================ */
const REGIMEN_MEDS: Record<string, MedDef[]> = {
  thiobucy: THIOBUCY_MEDS,
  hdmel: HDMEL_MEDS,
  buflubatg: BUFLUBATG_MEDS,
}

export interface OrderMedWithMeta extends OrderMed {
  note?: string
  sup?: boolean
}

export function getOrderMedsForDay(regimenId: string | null, day: number): OrderMedWithMeta[] {
  if (!regimenId) return []
  const meds = REGIMEN_MEDS[regimenId]
  if (!meds) return []
  return meds
    .filter((m) => m.days.includes(day))
    .map(({ days, ...med }) => med)
}
