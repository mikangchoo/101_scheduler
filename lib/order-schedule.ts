import type { OrderMed } from "@/lib/regimens"

/* ---------------- Conditioning day list ---------------- */

/** D-9 ... D0 */
export const CONDITIONING_DAYS: number[] = [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0]

export function formatDay(day: number): string {
  return day === 0 ? "D0" : `D${day}`
}

/* ---------------- Schedule editing helpers ---------------- */

/**
 * Citopcin default = ["08:00", "20:00"].
 * Double-click first cell → choose:
 *  - "12:00": first becomes 12:00, the 20:00 auto-shifts to 22:00 → ["12:00","22:00"]
 *  - "delete": drop the first, leaving only ["20:00"]
 */
export function applyCitopcinEdit(action: "12:00" | "delete"): string[] {
  if (action === "12:00") return ["12:00", "22:00"]
  return ["20:00"]
}

/**
 * Ursa default = ["08:00", "12:00", "18:00"].
 * Double-click first cell → choose:
 *  - "12:00": → ["12:00", "18:00", "22:00"]
 *  - "18:00": → ["18:00", "22:00"]
 */
export function applyUrsaEdit(action: "12:00" | "18:00"): string[] {
  if (action === "12:00") return ["12:00", "18:00", "22:00"]
  return ["18:00", "22:00"]
}

/* ---------------- Day → medication mapping ---------------- */

interface MedDef extends OrderMed {
  /** conditioning days this med is administered on */
  days: number[]
}

/** ThioBuCy (8 days regimen) daily order set */
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
    defaultTimes: ["09:00", "21:00"],
    days: [-5, -4],
  },
  {
    id: "levetiracetam",
    name: "Levetiracetam tab (Keppra)",
    detail: "[P.O]  ·  Sz prophylaxis (loading D-5, bid D-4~D-3)",
    scheduleKind: "fixed",
    defaultTimes: ["08:00", "20:00"],
    days: [-5, -4, -3],
  },
  {
    id: "cyclophosphamide",
    name: "Cyclophosphamide inj",
    detail: "[MIV] <Mix>  ·  miv over 1 hr",
    scheduleKind: "fixed",
    defaultTimes: ["10:00"],
    days: [-3, -2],
  },
  {
    id: "mesna",
    name: "Mesna inj",
    detail: "1000mg/NS50ml [IV] q6h  ·  start -30min before CTX",
    scheduleKind: "fixed",
    defaultTimes: ["06:00", "12:00", "18:00", "24:00"],
    days: [-3, -2],
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

const REGIMEN_MEDS: Record<string, MedDef[]> = {
  thiobucy: THIOBUCY_MEDS,
}

export function getOrderMedsForDay(regimenId: string | null, day: number): OrderMed[] {
  if (!regimenId) return []
  const meds = REGIMEN_MEDS[regimenId]
  if (!meds) return []
  return meds
    .filter((m) => m.days.includes(day))
    .map(({ days, ...med }) => med)
}
