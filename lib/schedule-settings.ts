/** Chemo start time when consent form is received (11A) */
export const CONSENT_YES_START = "11:00"

/** Options when consent form is NOT received */
export type NoConsentStart = "13:00" | "16:30"

export interface ScheduleSettings {
  /** null = not yet answered (first chemo day) */
  consentReceived: boolean | null
  /** Used when consentReceived === false */
  noConsentStart: NoConsentStart
}

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  consentReceived: null,
  noConsentStart: "13:00",
}

export function getChemoStartTime(settings: ScheduleSettings): string {
  if (settings.consentReceived === true) return CONSENT_YES_START
  if (settings.consentReceived === false) return settings.noConsentStart
  return CONSENT_YES_START
}

/** BID oral times (Citopcin) */
export function getBidOralTimes(settings: ScheduleSettings): string[] {
  const start = getChemoStartTime(settings)
  if (start === "13:00") return ["12:00", "18:00", "22:00"]
  if (start === "16:30") return ["18:00", "22:00"]
  return ["08:00", "20:00"]
}

/** TID oral times (Ursa) */
export function getTidOralTimes(settings: ScheduleSettings): string[] {
  const start = getChemoStartTime(settings)
  if (start === "13:00") return ["12:00", "18:00", "22:00"]
  if (start === "16:30") return ["18:00", "22:00"]
  return ["08:00", "12:00", "18:00"]
}

/** Mycamine daily time */
export function getMycamineTime(settings: ScheduleSettings): string {
  return getChemoStartTime(settings) === "16:30" ? "20:00" : "16:00"
}
