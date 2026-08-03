/** Chemo start time when consent form is received (11 A.M.) */
export const CONSENT_YES_START = "11:00"

/** Options when consent form is NOT received */
export type NoConsentStart = "13:00" | "16:30"

export interface ScheduleSettings {
  /** null = not yet answered (첫 항암 투약일 질문) */
  consentReceived: boolean | null
  /** Used when consentReceived === false */
  noConsentStart: NoConsentStart
}

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  consentReceived: null,
  noConsentStart: "13:00",
}

/** 첫 항암제 투약 시작 시간 */
export function getChemoStartTime(settings: ScheduleSettings): string {
  if (settings.consentReceived === false) return settings.noConsentStart
  return CONSENT_YES_START
}

/* ---------------- time utils (shared) ---------------- */

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + (m || 0)
}

export function fromMinutes(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** 시작시간이 늦춰졌는지 여부 */
export function isShifted(settings: ScheduleSettings): boolean {
  return getChemoStartTime(settings) !== CONSENT_YES_START
}

/**
 * BID oral (Citopcin 500mg bid).
 * 기본 08:00 / 20:00
 * 13:00 시작 → 08시 삭제, 12:00 / 22:00
 * 16:30 시작 → 08·12시 삭제, 18:00 / 22:00
 */
export function getBidOralTimes(settings: ScheduleSettings): string[] {
  const start = getChemoStartTime(settings)
  if (start === "13:00") return ["12:00", "22:00"]
  if (start === "16:30") return ["18:00", "22:00"]
  return ["08:00", "20:00"]
}

/**
 * TID oral (Ursa 200mg tid).
 * 기본 08:00 / 12:00 / 18:00
 * 13:00 시작 → 12:00 / 18:00 / 22:00
 * 16:30 시작 → 18:00 / 22:00
 */
export function getTidOralTimes(settings: ScheduleSettings): string[] {
  const start = getChemoStartTime(settings)
  if (start === "13:00") return ["12:00", "18:00", "22:00"]
  if (start === "16:30") return ["18:00", "22:00"]
  return ["08:00", "12:00", "18:00"]
}

/** 그 외 일반 PO (qd) 기본시간 → shift 시 재조정 */
export function getQdOralTime(settings: ScheduleSettings, base = "08:00"): string {
  const start = getChemoStartTime(settings)
  if (start === "13:00" && toMinutes(base) < toMinutes("12:00")) return "12:00"
  if (start === "16:30" && toMinutes(base) < toMinutes("18:00")) return "18:00"
  return base
}

/** Mycamine 1일 1회: 16:00, 단 16:30 시작이면 20:00 */
export function getMycamineTime(settings: ScheduleSettings): string {
  return getChemoStartTime(settings) === "16:30" ? "20:00" : "16:00"
}

export function describeStart(settings: ScheduleSettings): string {
  const start = getChemoStartTime(settings)
  if (settings.consentReceived === true) return `동의서 수령 · 첫 항암 ${start}`
  if (settings.consentReceived === false) return `동의서 미수령 · 첫 항암 ${start}`
  return `기본값 · 첫 항암 ${start}`
}
