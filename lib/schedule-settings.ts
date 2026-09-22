/** Chemo start time when consent form is received (11 A.M.) */
export const CONSENT_YES_START = "11:00"

/** Options when consent form is NOT received */
export type NoConsentStart = "13:00" | "13:30" | "16:30" | "17:30"

/** Allo GVHD prophylaxis branch. Null means not selected yet. */
export type DonorType = "related" | "unrelated" | null

export const NO_CONSENT_OPTIONS: { value: NoConsentStart; label: string }[] = [
  { value: "13:00", label: "1:00 P.M." },
  { value: "13:30", label: "1:30 P.M." },
  { value: "16:30", label: "4:30 P.M." },
  { value: "17:30", label: "5:30 P.M." },
]

/** 항암제 당기기 한도 (분) */
export const CHEMO_PULL_MIN = 120

/** Busulfan 포함 시 당기기 한도 (분) */
export const BUSULFAN_PULL_MIN = 60

export interface ScheduleSettings {
  /** null = not yet answered (첫 항암 투약일 질문) */
  consentReceived: boolean | null
  /** Used when consentReceived === false */
  noConsentStart: NoConsentStart
  /** 첫 항암 투약일 이후 일자별 "항암제 당기기" 여부 */
  pullForward: Record<number, boolean>
  /** Allo donor branch used to choose ATG dose and CsA/Tacrolimus orders. */
  donorType: DonorType
}

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  consentReceived: null,
  noConsentStart: "13:00",
  pullForward: {},
  donorType: null,
}

/** 첫 항암제 투약 시작 시간 */
export function getChemoStartTime(settings: ScheduleSettings): string {
  if (settings.consentReceived === false) return settings.noConsentStart
  return CONSENT_YES_START
}

/** 해당 일자에 당기기가 선택되었는지 */
export function isPullForward(settings: ScheduleSettings, day: number): boolean {
  return (settings.pullForward ?? {})[day] === true
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

/** BID oral */
export function getBidOralTimes(settings: ScheduleSettings): string[] {
  const start = getChemoStartTime(settings)

  if (start === "13:00" || start === "13:30") {
    return ["12:00", "22:00"]
  }

  if (start === "16:30" || start === "17:30") {
    return ["18:00", "22:00"]
  }

  return ["08:00", "20:00"]
}

/** TID oral */
export function getTidOralTimes(settings: ScheduleSettings): string[] {
  const start = getChemoStartTime(settings)

  if (start === "13:00" || start === "13:30") {
    return ["12:00", "18:00", "22:00"]
  }

  if (start === "16:30" || start === "17:30") {
    return ["18:00", "22:00"]
  }

  return ["08:00", "12:00", "18:00"]
}

/** 그 외 일반 PO (qd) */
export function getQdOralTime(
  settings: ScheduleSettings,
  base = "08:00",
): string {
  const start = getChemoStartTime(settings)

  if (
    (start === "13:00" || start === "13:30") &&
    toMinutes(base) < toMinutes("12:00")
  ) {
    return "12:00"
  }

  if (
    (start === "16:30" || start === "17:30") &&
    toMinutes(base) < toMinutes("18:00")
  ) {
    return "18:00"
  }

  return base
}

/** Mycamine 1일 1회 */
export function getMycamineTime(settings: ScheduleSettings): string {
  const start = getChemoStartTime(settings)
  return start === "16:30" || start === "17:30" ? "20:00" : "16:00"
}

export function describeStart(settings: ScheduleSettings): string {
  const start = getChemoStartTime(settings)

  if (settings.consentReceived === true) {
    return `동의서 수령 · 첫 항암 ${start}`
  }

  if (settings.consentReceived === false) {
    return `동의서 미수령 · 첫 항암 ${start}`
  }

  return `기본값 · 첫 항암 ${start}`
}
