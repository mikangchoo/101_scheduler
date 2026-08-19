import type { OrderMed } from "@/lib/regimens"
import {
  BUSULFAN_PULL_MIN,
  CHEMO_PULL_MIN,
  fromMinutes,
  getBidOralTimes,
  getChemoStartTime,
  getMycamineTime,
  getQdOralTime,
  getTidOralTimes,
  isPullForward,
  toMinutes,
  type ScheduleSettings,
} from "@/lib/schedule-settings"

/* ---------------- Conditioning day list ---------------- */

export const CONDITIONING_DAYS: number[] = [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 3, 4, 6]

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
  /** 항암제 — 스케줄러가 충돌 없이 연속 배치 */
  | { type: "chemo"; durationMin: number; order?: number }
  /** antiemetics IV — 그 날 첫 항암제 30분 전, (단독) 표기 */
  | { type: "antiemetic-iv" }
  /** 첫 항암제 기준 상대시간 (Emend 125mg 등) */
  | { type: "pre-chemo"; offsetMin: number }
  /** 특정 약제 기준 상대시간 (음수 = 이전) */
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
  /** 시간 선택 드롭다운 (Thiotepa / MTX D1) */
  | { type: "select"; options: string[]; defaultTime: string }

interface MedDef {
  id: string
  name: string
  detail: string
  /** 묶음 오더의 용매 줄 (수행시간은 윗줄만 표기) */
  solvent?: string
  /** 표시용 suffix (정주시간 등) */
  suffix?: string
  /** 수행시간 옆 부가 표기 (얼음/EKG, 이식<>24hr 등) */
  timeNote?: string
  /** SUP(수액/보조) 뱃지 */
  sup?: boolean
  /** 안내문 */
  note?: string
  /** 경구약 — 첫 투약 +1 / 마지막 투약 조제유보 아이콘 대상 */
  oral?: boolean
  /** IV/IM 등 비경구약도 첫 투약일에 +1 행 생성 (Kanitron 3mg amp 등) */
  firstDoseExtra?: boolean
  /** 컨디셔닝 이후로도 지속 투약 (마지막 투약 아이콘 생성 X) */
  continuous?: boolean
  /** +1 오더/조제유보 생성 제외 (Zyprexa 등) */
  noExtraOrder?: boolean
  /** 마지막 투약일 조제유보 예외 (Keppra 500mg) + 마지막 시간에 (end) 표기 */
  noHoldLast?: boolean
  /** 투약 일자 */
  days: number[]
  rule: TimeRule
  /** 표시 순서 */
  sort?: number
}

/* ------------------------------------------------------------------ *
 * Common solvent lines
 * ------------------------------------------------------------------ */

const NS50 = "Normal saline 50mL bag 중외      1 bag  [IV]  <Mix>  x1"
const NS100 = "Normal saline 100mL bag 대한      1 bag  [IV]  <Mix>  x1"
const NS250 = "Normal saline 250mL btl 중외      1 btl  [IV]  <Mix>  x1"
const NS500 = "Normal saline 500mL btl 대한      1 btl  [IV]  <Mix>  x1"
const D5W100 = "Dextrose 5% 100mL bag 중외      1 bag  [IV]  <Mix>  x1"
const D5W200 = "Dextrose 5% 200mL bag 중외      1 bag  [IV]  <Mix>  x1"

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
  /** 목표 격자: 11:00 / 17:00 / 23:00 / 05:00(익일) */
  const grid = [11 * 60, 17 * 60, 23 * 60, 29 * 60]
  const out: string[] = []
  for (let i = 0; i < 4; i++) {
    let t = first + i * 360
    if (i > 0) {
      const g = grid[i]
      if (g != null && Math.abs(g - t) <= 30) t = g
    }
    out.push(t >= 1440 ? `${fromMinutes(t)}(익일)` : fromMinutes(t))
  }
  return out
}

/* ============================================================ *
 * ThioBuCy  (D-8 → D0)
 * ============================================================ */
const THIOBUCY_MEDS: MedDef[] = [
  {
    id: "palonosetron",
    name: "Aloxi 0.25mg/5ml inj(Palonosetron)      1 via(5mL)  [IV]    x1",
    detail: "0.25 mg [IV] qd",
    solvent: NS50,
    days: [-8],
    sort: 4,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
  {
    id: "thiotepa",
    name: "Tepadina inj (Thiotepa)",
    detail: "[IV] <Mix> x1 · miv over 60min",
    solvent: NS500,
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
    solvent: NS500,
    suffix: "ov3h",
    days: [-5, -4],
    sort: 10,
    rule: { type: "chemo", durationMin: 180 },
  },
    {
    id: "levetiracetam 1g",
    name: "Levetiracetam 1g tab (Keppra)",
    detail: "[P.O] · Sz prophylaxis",
    oral: true,
    days: [-5],
    sort: 60,
    rule: { type: "oral", freq: "qd" },
  },
  {
    id: "levetiracetam 500mg",
    name: "Levetiracetam 500mg tab (Keppra)",
    detail: "[P.O] · Sz prophylaxis",
    oral: true,
    noHoldLast: true,
    days: [-5, -4, -3],
    sort: 60,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "cyclophosphamide",
    name: "Cyclophosphamide inj",
    detail: "[MIV] <Mix> · miv over 1hr",
    solvent: D5W200,
    suffix: "ov1h",
    timeNote: "얼음/EKG",
    days: [-3, -2],
    sort: 10,
    rule: { type: "chemo", durationMin: 60 },
  },
  {
    id: "granisetron-iv",
    name: "Kanitron 3mg/3mL inj(Granisetron)      3 mg(3 mL)  [IV]   x1",
    detail: "3 mg [IV] qd",
    solvent: NS50,
    days: [-5, -4, -3],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
    {
    id: "aprepitant 125mg",
    name: "Emend 125mg cap(Aprepitant)",
    detail: "1 cap [P.O] daily ut dict",
    oral: true,
    days: [-3],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "pre-chemo", offsetMin: -60 },
  },
      {
    id: "aprepitant 80mg",
    name: "Emend 80mg cap(Aprepitant)",
    detail: "1 cap [P.O] daily ut dict",
    oral: true,
    days: [-2, -1],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "fixed", times: ["08:00"] },
  },
    {
    id: "dexamethasone 12mg",
    name: "Dexamethasone disodium phosphate 12mg",
    detail: "<MIV> · [IVS]",
    solvent: NS50,
    suffix: "차",
    days: [-3],
    sort: 6,
    rule: { type: "pre-chemo", offsetMin: -30 },
  },
  {
    id: "dexamethasone 8mg",
    name: "Dexamethasone disodium phosphate 5mg/1ml 8mg",
    detail: "<MIV> · [IVS]",
    solvent: NS50,
    suffix: "차",
    days: [-2, -1],
    sort: 6,
    rule: { type: "pre-chemo", offsetMin: -30 },
  },
  {
    id: "mesna",
    name: "Uromitexan 400mg/4ml inj(Mesna) 1000mg",
    detail: "<MIV> · q6hr",
    solvent: NS50,
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
    timeNote: "",
    days: [-3, -2, -1, 0],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "furosemide 10mg",
    name: "Lasix inj 20mg (Furosemide) 10mg",
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
    oral: true,
    continuous: true,
    days: [-8, -7, -6, -5, -4, -3, -2, -1, 0],
    sort: 70,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "ursa",
    name: "Ursa 200mg tab (UDCA)",
    detail: "1 tab [P.O] tid",
    oral: true,
    continuous: true,
    days: [-7, -6, -5, -4, -3, -2, -1, 0],
    sort: 71,
    rule: { type: "oral", freq: "tid" },
  },
  {
    id: "mycamine",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    solvent: NS100,
    continuous: true,
    days: [-8, -7, -6, -5, -4, -3, -2, -1, 0],
    sort: 75,
    rule: { type: "mycamine" },
  },
  {
    id: "zyprexa",
    name: "Zyprexa 10mg tab (Olanzapine)",
    detail: "1 tab [P.O] daily hs [D]",
    oral: true,
    noExtraOrder: true,
    days: [-8, -7, -6],
    sort: 90,
    rule: { type: "fixed", times: ["21:00"] },
  },
  {
    id: "stemcell-auto",
    name: "자가말초혈액조혈모세포 주입술",
    detail: "[IV] x1",
    days: [0],
    sort: 0,
    rule: { type: "fixed", times: ["14:00"] },
  },
  {
    id: "stemcell-premed",
    name: "Chlorepheniramine meleate 4mg/2ml inj유한",
    detail: "1 amp(2 mL) [IV] x1",
    days: [0],
    sort: 1,
    rule: { type: "fixed", times: ["14:00"] },
  },
]

/* ============================================================ *
 * HDMEL
 * ============================================================ */
const HDMEL_MEDS: MedDef[] = [
  {
    id: "melphalan",
    name: "Megval 50mg inj (Melphalan)",
    detail: "<MIV> · miv over 30min",
    solvent: NS500,
    suffix: "얼차ov30m",
    days: [-3, -2],
    sort: 10,
    rule: { type: "chemo", durationMin: 30 },
  },
  {
    id: "granisetron-iv",
    name: "Kanitron 3mg/3mL inj(Granisetron)      3 mg(3 mL)  [IV]   x1",
    detail: "3 mg [IV] qd",
    solvent: NS50,
    days: [-3, -2],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
  {
    id: "dexamethasone 10mg",
    name: "Dexamethasone disodium phosphate 10mg",
    detail: "<MIV> · [IVS]",
    solvent: NS50,
    suffix: "차",
    days: [-3, -2],
    sort: 6,
    rule: { type: "pre-chemo", offsetMin: -30 },
  },
  {
    id: "hyd-pre-mel",
    name: "Dextrose 5% Na K2 1L bag(D5WNa77K20)",
    detail: "[IV] 250ch MEL -6hr ~ +12hr, in the meantime 75ch",
    sup: true,
    timeNote: "250 cc/hr",
    note: "",
    days: [-3, -2],
    sort: 80,
    rule: { type: "relative", ref: "melphalan", offsetMin: -360, repeatEveryMin: 240, count: 3 },
  },
  {
    id: "furosemide 20mg",
    name: "Lasix 20mg/2ml inj(Furosemide)",
    detail: "[IVS] · +1hr after Mel",
    suffix: "MEL+1h",
    days: [-3, -2],
    sort: 30,
    rule: { type: "relative", ref: "melphalan", offsetMin: 60 },
  },
  {
    id: "citopcin-hdmel",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    oral: true,
    continuous: true,
    days: [-3, -2, -1, 0],
    sort: 70,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "mycamine-hdmel",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    solvent: NS100,
    continuous: true,
    days: [-3, -2, -1, 0],
    sort: 75,
    rule: { type: "mycamine" },
  },
  {
    id: "stemcell-auto",
    name: "자가말초혈액조혈모세포 주입술",
    detail: "[IV] x1",
    days: [0],
    sort: 0,
    rule: { type: "fixed", times: ["14:00"] },
  },
  {
    id: "stemcell-premed",
    name: "Chlorepheniramine meleate 4mg/2ml inj유한",
    detail: "1 amp(2 mL) [IV] x1",
    days: [0],
    sort: 1,
    rule: { type: "fixed", times: ["14:00"] },
  },
    {
    id: "granisetron-po",
    name: "Kanitron tab 1mg (Granisetron)",
    detail: "1 mg [P.O] qd",
    oral: true,
    days: [-1, 0],
    sort: 6,
    rule: { type: "fixed", times: ["08:00"] },
  },
]

/* ============================================================ *
 * BuFluATG
 * ============================================================ */
const BUFLUBATG_MEDS: MedDef[] = [
  {
    id: "fludarabine",
    name: "Fludara 50mg inj(Fludarabine)",
    detail: "[IV] <Mix> x1 · over 1hr",
    solvent: NS100,
    suffix: "ov1h",
    days: [-6, -5, -4, -3],
    sort: 10,
    rule: { type: "chemo", durationMin: 60 },
  },
  {
    id: "busulfan-batg",
    name: "IV Busulfan inj (Busulfan)",
    detail: "[MIV] <Mix> · miv over 3hrs",
    solvent: NS500,
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
    oral: true,
    note: "Busulfan 3–4시간 전 loading 1500mg (D-6), 이후 500mg bid",
    days: [-6, -5, -4, -3, -2],
    sort: 60,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "granisetron-batg",
    name: "Kanitron 3mg/3mL inj(Granisetron)      3 mg(3 mL)  [IV]   x1",
    detail: "3 mg [IV] qd",
    solvent: NS50,
    days: [-6, -5, -4, -3],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
  {
    id: "atg",
    name: "Thymoglobulin 25mg(Antithymocyteglobulin rabbit)",
    detail: "[MIV] <Mix> x1 · over 6hrs via I-med",
    solvent: NS500,
    suffix: "ov6h",
    note: "1.5mg/kg/day (matched related) · 2.5mg/kg/day (unrelated/mismatched)",
    days: [-3, -2, -1],
    sort: 12,
    rule: { type: "chemo", durationMin: 360 },
  },
  {
    id: "mpred",
    name: "Predisol 125mg inj(Methylprednisolone Na succinate)",
    detail: "[IV] <Mix> x2 · over 30mins",
    solvent: D5W100,
    note: "Thymoglobulin 30분 전 투약 + 12시간 간격 2회 (통상 23:00)",
    days: [-3, -2, -1],
    sort: 61,
    rule: { type: "relative", ref: "atg", offsetMin: -30, repeatEveryMin: 720, count: 2 },
  },
  {
    id: "acetaminophen-atg",
    name: "Acetaminophen삼남 300mg(Acetaminophen)",
    detail: "2 tab [P.O] daily ++ · ATG premed -1hr",
    oral: true,
    days: [-3, -2, -1],
    sort: 62,
    rule: { type: "relative", ref: "atg", offsetMin: -60 },
  },
  {
    id: "chlorpheniramine-atg",
    name: "Chlorpheniramine maleate 4mg/2mL inj 유한",
    detail: "1 amp(2 mL) [IV] x1 · ATG premed -30min",
    days: [-3, -2, -1],
    sort: 63,
    rule: { type: "relative", ref: "atg", offsetMin: -30 },
  },
  {
    id: "hydrocortisone-atg",
    name: "Cortisolu 100mg inj(Hydrocortisone)",
    detail: "50 mg [IV] x1 [S] · ATG +30min",
    days: [-3, -2, -1],
    sort: 64,
    rule: { type: "relative", ref: "atg", offsetMin: 30 },
  },
  {
    id: "mtx-d1",
    name: "Pfizer Methotrexate 50mg/2mL inj(Methotrexate)",
    detail: "[IV] <Mix> x1 · GVHD prophylaxis",
    timeNote: "이식<>24hr",
    days: [1],
    sort: 13,
    rule: {
      type: "select",
      defaultTime: "19:00",
      options: ["11:00", "13:00", "15:00", "17:00", "19:00", "21:00", "23:00"],
    },
  },
  {
    id: "mtx-d3d6",
    name: "Pfizer Methotrexate 50mg/2mL inj(Methotrexate)",
    detail: "[IV] <Mix> x1 · GVHD prophylaxis",
    days: [3, 6],
    sort: 13,
    rule: { type: "fixed", times: ["11:00"] },
  },
  {
    id: "tacrolimus-batg",
    name: "Prograf 5mg/1mL inj(Tacrolimus)",
    detail: "[MIV] <Mix> x1 · continuous",
    solvent: "Normal saline 500mL bag 중외      1 bag  [IV]  <Mix>  x1",
    continuous: true,
    days: [-1, 0, 1, 3, 4, 6],
    sort: 65,
    rule: { type: "fixed", times: ["09:00"] },
  },
  {
    id: "hydration-batg",
    name: "Dextrose 5% Na K2 1L (NaK2V)",
    detail: "[IV] hydration",
    sup: true,
    timeNote: "125 cc/hr",
    days: [-6, -5, -4, -3],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "citopcin-batg",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    oral: true,
    continuous: true,
    days: [-6, -5, -4, -3, -2, -1, 0],
    sort: 70,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "ursa-batg",
    name: "Ursa 200mg tab (UDCA)",
    detail: "1 tab [P.O] tid",
    oral: true,
    continuous: true,
    days: [-6, -5, -4, -3, -2, -1, 0],
    sort: 71,
    rule: { type: "oral", freq: "tid" },
  },
  {
    id: "mycamine-batg",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    solvent: NS100,
    continuous: true,
    days: [-6, -5, -4, -3, -2, -1, 0],
    sort: 75,
    rule: { type: "mycamine" },
  },
  {
    id: "stemcell-allo",
    name: "동종말초혈액조혈모세포 주입술",
    detail: "[IV] x1",
    days: [0],
    sort: 0,
    rule: { type: "fixed", times: ["17:00"] },
  },
  {
    id: "stemcell-premed-allo",
    name: "Chlorepheniramine meleate 4mg/2ml inj유한",
    detail: "1 amp(2 mL) [IV] x1",
    days: [0],
    sort: 1,
    rule: { type: "fixed", times: ["17:00"] },
  },
]

/* ============================================================ *
 * BuFlu-PTCy  (컨디셔닝 D-6~D-2, PTCy D+3/D+4)
 * ============================================================ */
const BUFLU_PTCY_MEDS: MedDef[] = [
  {
    id: "fludarabine-ptcy",
    name: "Fludara 50mg inj(Fludarabine)",
    detail: "[IV] <Mix> x1 · over 1hr",
    solvent: NS100,
    suffix: "ov1h",
    days: [-6, -5, -4, -3, -2],
    sort: 10,
    rule: { type: "chemo", durationMin: 60 },
  },
  {
    id: "busulfan-ptcy",
    name: "IV Busulfan inj (Busulfan)",
    detail: "[MIV] <Mix> · miv over 3hrs",
    solvent: NS500,
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
    oral: true,
    days: [-6, -5, -4, -3, -2],
    sort: 60,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "granisetron-ptcy",
    name: "Kanitron 3mg/3mL inj(Granisetron)      3 mg(3 mL)  [IV]   x1",
    detail: "3 mg [IV] qd",
    solvent: NS50,
    days: [-6, -5, -4, -3, -2],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
  {
    id: "ptcy",
    name: "Cyclophosphamide inj (PTCy)",
    detail: "50 mg/kg [MIV] <Mix> · miv over 1hr",
    solvent: D5W200,
    suffix: "ov1h",
    timeNote: "얼음/EKG",
    note: "D+3, D+4 (stem cell infusion 후 72시간)",
    days: [3, 4],
    sort: 10,
    rule: { type: "chemo", durationMin: 60 },
  },
  {
    id: "granisetron-ptcy-post",
    name: "Kanitron 3mg/3mL inj(Granisetron)      3 mg(3 mL)  [IV]   x1",
    detail: "3 mg [IV] qd",
    solvent: NS50,
    days: [3, 4],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
  {
    id: "mesna-ptcy",
    name: "MUromitexan 400mg/4ml inj(Mesna) 1000mg",
    detail: "<MIV> · q6hr",
    solvent: NS50,
    note: "PTCy 시작 30분 전 → q6hr (익일분 포함)",
    days: [3, 4],
    sort: 20,
    rule: { type: "mesna", ref: "ptcy" },
  },
  {
    id: "hydration-ptcy",
    name: "Dextrose 5% Na K2 1L (NaK2V)",
    detail: "[IV] hydration",
    sup: true,
    timeNote: "125 cc/hr",
    days: [-6, -5, -4, -3, -2, 3, 4],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "furosemide 10mg",
    name: "Lasix inj 20mg (Furosemide) 10mg",
    detail: "[IV] q6h",
    note: "if 6hr u/o < 1L or 150ml/hr",
    days: [3, 4],
    sort: 85,
    rule: { type: "fixed", times: ["06:00"] },
  },
    {
    id: "urine-output",
    name: "Check urine output q 6hr",
    detail: "if 6hr u/o < 1L or 150ml/hr → furosemide 1A ivs",
    days: [3, 4],
    sort: 86,
    rule: { type: "fixed", times: ["06:00", "12:00", "18:00"] },
  },
  {
    id: "tacrolimus-ptcy",
    name: "Prograf 5mg/1mL inj(Tacrolimus)",
    detail: "0.02 mg/kg/day [MIV] <Mix> x1 · D+5부터",
    solvent: "Normal saline 500mL bag 중외      1 bag  [IV]  <Mix>  x1",
    continuous: true,
    note: "GVHD prophylaxis (CNI) — PTCy 종료 후 개시",
    days: [4],
    sort: 65,
    rule: { type: "fixed", times: ["09:00"] },
  },
  {
    id: "mmf-ptcy",
    name: "Mycophenolate mofetil cap 500mg",
    detail: "15 mg/kg [P.O] tid · D+5 ~ D+35",
    oral: true,
    continuous: true,
    days: [4],
    sort: 66,
    rule: { type: "oral", freq: "tid" },
  },
  {
    id: "citopcin-ptcy",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    oral: true,
    continuous: true,
    days: [-6, -5, -4, -3, -2, -1, 0, 3, 4],
    sort: 70,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "ursa-ptcy",
    name: "Ursa 200mg tab (UDCA)",
    detail: "1 tab [P.O] tid",
    oral: true,
    continuous: true,
    days: [-6, -5, -4, -3, -2, -1, 0, 3, 4],
    sort: 71,
    rule: { type: "oral", freq: "tid" },
  },
  {
    id: "mycamine-ptcy",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    solvent: NS100,
    continuous: true,
    days: [-6, -5, -4, -3, -2, -1, 0, 3, 4],
    sort: 75,
    rule: { type: "mycamine" },
  },
  {
    id: "stemcell-allo",
    name: "동종말초혈액조혈모세포 주입술",
    detail: "[IV] x1",
    days: [0],
    sort: 0,
    rule: { type: "fixed", times: ["17:00"] },
  },
  {
    id: "stemcell-premed-allo",
    name: "Chlorepheniramine meleate 4mg/2ml inj유한",
    detail: "1 amp(2 mL) [IV] x1",
    days: [0],
    sort: 1,
    rule: { type: "fixed", times: ["17:00"] },
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
  /** 묶음 오더의 용매 줄 */
  solvent?: string
  /** 수행시간 옆 부가 표기 */
  timeNote?: string
  /** (단독) 표기 */
  solo?: boolean
  /** 첫 투약 → +1 오더 행 생성 (경구약 또는 firstDoseExtra) */
  firstDose?: boolean
  /** 경구약 마지막 투약 → 조제유보 아이콘 */
  lastOralDose?: boolean
}

/* ------------------------------------------------------------------ *
 * Chemo scheduling
 *  - 항암제는 항상 연속 투약 (앞 약 종료 시각에 다음 약 시작)
 *  - 첫 항암 투약일: 동의서 응답으로 시작 시간 결정
 *  - 이후 일자: 전일 시작 시각을 이어받고, "당기기" 선택 시
 *    최대 2시간 (Busulfan 포함 시 1시간) 만 당김
 * ------------------------------------------------------------------ */

function chemoDefsForDay(regimenId: string, day: number): MedDef[] {
  const all = REGIMEN_MEDS[regimenId] ?? []
  return all.filter((m) => m.days.includes(day) && m.rule.type === "chemo")
}

/** 그 날 당길 수 있는 최대 시간(분) */
export function getPullLimitMin(regimenId: string | null, day: number): number {
  if (!regimenId) return CHEMO_PULL_MIN
  const chemo = chemoDefsForDay(regimenId, day)
  const hasBusulfan = chemo.some((m) => m.id.startsWith("busulfan"))
  return hasBusulfan ? BUSULFAN_PULL_MIN : CHEMO_PULL_MIN
}

/** 해당 일자의 첫 항암제 시작 시각(분) */
export function getChemoStartMinutesForDay(
  regimenId: string | null,
  day: number,
  days: number[],
  settings: ScheduleSettings,
): number {
  let cursor = toMinutes(getChemoStartTime(settings))
  const firstDay = days[0]
  for (const d of days) {
    if (d > day) break
    if (d === firstDay) continue
    if (!regimenId || chemoDefsForDay(regimenId, d).length === 0) continue
    if (isPullForward(settings, d)) cursor -= getPullLimitMin(regimenId, d)
  }
  // 첫 항암 투약일은 선택한 시간 그대로, 이후 날짜는 최소 11:00
  return day === firstDay ? cursor : Math.max(11 * 60, cursor)
}

function scheduleChemo(
  meds: MedDef[],
  startMin: number,
): { at: Record<string, number>; firstStart: number } {
  const chemo = meds
    .filter((m) => m.rule.type === "chemo")
    .sort((a, b) => {
      const ra = a.rule as Extract<TimeRule, { type: "chemo" }>
      const rb = b.rule as Extract<TimeRule, { type: "chemo" }>
      if ((ra.order ?? 0) !== (rb.order ?? 0)) return (ra.order ?? 0) - (rb.order ?? 0)
      return ra.durationMin - rb.durationMin
    })

  const at: Record<string, number> = {}
  let cursor = startMin
  for (const m of chemo) {
    const rule = m.rule as Extract<TimeRule, { type: "chemo" }>
    at[m.id] = cursor
    cursor += rule.durationMin // 연속 투약 (동시 투약 방지)
  }

  // 시간 선택형(Thiotepa / MTX D1)도 기준 시각으로 등록
  for (const m of meds) {
    if (m.rule.type === "select") at[m.id] = toMinutes(m.rule.defaultTime)
  }

  const firstStart = chemo.length > 0 ? at[chemo[0]!.id]! : startMin
  return { at, firstStart }
}

function resolveTimes(
  med: MedDef,
  anchors: Record<string, number>,
  firstChemo: number,
  settings: ScheduleSettings,
): string[] {
  const rule = med.rule
  switch (rule.type) {
    case "chemo":
      return [fromMinutes(anchors[med.id] ?? firstChemo)]
    case "select":
      return [rule.defaultTime]
    case "antiemetic-iv":
      return [fromMinutes(firstChemo - 30)]
    case "pre-chemo":
      return [fromMinutes(firstChemo + rule.offsetMin)]
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
  days?: number[],
): OrderMedWithMeta[] {
  if (!regimenId) return []
  const all = REGIMEN_MEDS[regimenId]
  if (!all) return []

  const dayList = days && days.length > 0 ? days : getOrderDaysForRegimen(regimenId)
  const todays = all.filter((m) => m.days.includes(day))
  const rawStart = getChemoStartMinutesForDay(regimenId, day, dayList, settings)
  // mesna / M-pred / dexamethasone <Mix> 오더가 있는 날은 그 오더를 11:00 에 두고
  // 항암제를 11:30 이후로 밀어낸다
  const hasMixPriority = todays.some(
    (m) => /^(mesna|mpred|dexamethasone)/.test(m.id) && (m.solvent ?? "").includes("<Mix>"),
  )
  const startMin = hasMixPriority ? Math.max(rawStart, 11 * 60 + 30) : rawStart
  const { at: anchors, firstStart } = scheduleChemo(todays, startMin)

  return todays
    .slice()
    .sort((a, b) => (a.sort ?? 50) - (b.sort ?? 50))
    .map((m) => {
      const sortedDays = m.days.slice().sort((x, y) => x - y)
      return {
        id: m.id,
        name: m.name,
        detail: m.detail,
        suffix: m.suffix,
        note: m.note,
        sup: m.sup,
        solvent: m.solvent,
        timeNote: m.timeNote,
        solo: m.rule.type === "antiemetic-iv",
        firstDose:
          !m.noExtraOrder &&
          ((m.oral === true && day === sortedDays[0]) ||
           (m.firstDoseExtra === true && day === sortedDays[0]) ||
           (m.rule.type === "antiemetic-iv" && day === sortedDays[0])),
        lastOralDose:
          !m.noExtraOrder &&
          !m.noHoldLast &&
          (m.oral === true || m.firstDoseExtra === true || m.rule.type === "antiemetic-iv") &&
          m.continuous !== true &&
          day === sortedDays[sortedDays.length - 1],
        endMark: m.noHoldLast === true && day === sortedDays[sortedDays.length - 1],
        scheduleKind: displayKind(m),
        defaultTimes: resolveTimes(m, anchors, firstStart, settings),
        timeOptions: m.rule.type === "select" ? m.rule.options : undefined,
      }
    })
}
