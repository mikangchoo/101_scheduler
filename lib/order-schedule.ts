import { isAutoRegimen, type OrderMed } from "@/lib/regimens"
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
  | {
      type: "relative"
      ref: string
      offsetMin: number
      repeatEveryMin?: number
      count?: number
      roundDownToHour?: boolean
    }
  /** Cyclophosphamide 기준 -30분부터 q6hr */
  | { type: "mesna"; ref: string }
  /** Cyclophosphamide 시작 시간에 맞춰 개시하는 EKG monitoring */
  | { type: "ekg-monitoring"; ref: string }
  /** 고정 시간 (shift 영향 없음) */
  | { type: "fixed"; times: string[] }
  /** PO 규칙 (shift 영향) */
  | { type: "oral"; freq: "bid" | "tid" | "qd"; base?: string }
  /** Mycamine */
  | { type: "mycamine" }
  /** 수액 교환 (rate 기반 grid) */
  | { type: "hydration"; rateCcHr: number }
  /** HDMEL Melphalan hydration */
  | {
      type: "melphalan-hydration"
      regimenId?: string
      melphalanDays?: number[]
      activeStartDay?: number
      activeEndDay?: number
      reviewDay?: number | null
    }
  /** PRN */
  | { type: "prn" }
  /** 시간 선택 드롭다운 (MTX D1). isChemo=true면 실제 항암일로 계산 */
  | { type: "select"; options: string[]; defaultTime: string; isChemo?: boolean }
  /** TBI처럼 시간은 선택하지만 항암 시작/당기기 계산에는 포함하지 않는 시술 */
  | { type: "procedure"; options: string[]; defaultTime: string }

interface MedDef {
  id: string
  name: string
  detail: string
  /** 묶음 오더의 용매 줄 (수행시간은 윗줄만 표기) */
  solvent?: string
  /** 용매가 아닌 추가 약품 묶음 줄 (수행시간은 첫 약품에만 표기) */
  bundleItems?: OrderBundleItem[]
  /** 표시용 suffix (정주시간 등) */
  suffix?: string
  /** 분할 투약 시 각 시작시간마다 suffix를 반복 표시 */
  suffixEachTime?: boolean
  /** 한 오더를 동일 간격의 연속 투약으로 나눠 표시 */
  splitInfusion?: { count: number; intervalMin: number }
  /** 수행시간 옆 부가 표기 (얼음/EKG, 이식<>24hr 등) */
  timeNote?: string
  /** 첫 수행시간 바로 뒤에만 표시할 부가 표기 */
  firstTimeNote?: string
  /** SUP(수액/보조) 뱃지 */
  sup?: boolean
  /** TIT 뱃지 */
  tit?: boolean
  /** 향정신성의약품 뱃지 */
  controlled?: boolean
  /** PRN 뱃지 */
  prnBadge?: boolean
  /** 안내문 */
  note?: string
  /** 경구약 — 첫 투약 +1 / 마지막 투약 조제유보 아이콘 대상 */
  oral?: boolean
  /** IV/IM 등 비경구약도 첫 투약일에 +1 행 생성 (Kanitron 3mg amp 등) */
  firstDoseExtra?: boolean
  /** +1 행에도 본 오더의 작은 용법·용량 줄을 반복 표시 */
  repeatDetailOnFirstDose?: boolean
  /** +1 행에만 사용할 별도 용법·용량 */
  firstDoseDetail?: string
  /** 컨디셔닝 이후로도 지속 투약 (마지막 투약 아이콘 생성 X) */
  continuous?: boolean
  /** +1 오더 및 마지막 투약 조제유보 생성 제외 */
  noExtraOrder?: boolean
  /** 마지막 투약일 조제유보 예외 (Keppra 500mg) + 마지막 시간에 (end) 표기 */
  noHoldLast?: boolean
  /** 마지막 투약일의 (end) 표기 제외 */
  noEndMark?: boolean
  /** 본 오더에 조제유보 뱃지를 강제로 표시 */
  holdMainOrder?: boolean
  /** 첫 투약 +1 오더에 조제유보 뱃지를 강제로 표시 */
  holdFirstDose?: boolean
  /** 첫 투약 +1 오더에는 조제유보 뱃지를 표시하지 않음 */
  noHoldFirstDose?: boolean
  /** 투약 일자 */
  days: number[]
  /** Allo 공여자 유형에 따라 CsA/Tacrolimus 실제 오더를 상호배타적으로 표시 */
  donorType?: Exclude<ScheduleSettings["donorType"], null>
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

/**
 * 신규 레지멘은 계산된 용매량을 레지멘 원문에서 가져온다.
 * 고정 용량을 약품명에 중복 표기하면 계산 결과와 충돌할 수 있으므로 generic label을 쓴다.
 */
const NS_MIX = "Normal saline bag      [IV]  <Mix>  x1"
const NS_TWO_BAG_MIX = "Normal saline 1000mL bag 이노엔      1 bag [MIV] <Mix> x2"
const D5W_MIX = "Dextrose 5% bag      [IV]  <Mix>  x1"

export interface OrderBundleItem {
  name: string
  detail?: string
}

function vitaminKOrder(id: string, days: number[]): MedDef {
  return {
    id,
    name: "Vitamin K1 10mg/1mL inj(Phytonadione) 대한",
    detail: "1 amp(1mL) [IV] x1",
    tit: true,
    days,
    sort: 79,
    rule: { type: "fixed", times: [] },
  }
}

/* ------------------------------------------------------------------ *
 * Time helpers
 * ------------------------------------------------------------------ */

export function getHydrationTimes(rateCcHr: number): string[] {
  if (!Number.isFinite(rateCcHr) || rateCcHr <= 0) return []
  // 1 bag = 1000mL. 잔량과 관계없이 정시에 교환하며 매일 00:00부터 다시 계산한다.
  // 210ch 이하는 200ch 기준(5시간), 211ch 이상은 4시간 간격으로 교환한다.
  const intervalHours = rateCcHr <= 210 ? 5 : 4
  return Array.from(
    { length: Math.ceil(24 / intervalHours) },
    (_, index) => fromMinutes(index * intervalHours * 60),
  )
}

/**
 * BSA로 계산된 hydration 속도의 1L bag 교환 시간.
 * 고정 속도 hydration은 기존 getHydrationTimes 규칙을 유지한다.
 */
export function getCalculatedHydrationTimes(
  rateCcHr: number,
  day: number,
  firstDay: number,
): string[] {
  if (!Number.isFinite(rateCcHr) || rateCcHr <= 0) return []

  if (rateCcHr > 130) {
    return ["00:00", "05:00", "10:00", "15:00", "20:00"]
  }
  if (rateCcHr > 85) return ["00:00", "08:00", "16:00"]
  if (rateCcHr > 65) return ["00:00", "12:00"]

  if (rateCcHr >= 45 && rateCcHr <= 65) {
    // 16시간 간격을 자정 기준으로 연속 표시:
    // 첫날 00:00/16:00 → 다음날 08:00 → 반복.
    const dayOffset = ((day - firstDay) % 2 + 2) % 2
    return dayOffset === 0 ? ["00:00", "16:00"] : ["08:00"]
  }

  return ["00:00"]
}

const DAY_MINUTES = 24 * 60
const HOUR_MINUTES = 60
const HYDRATION_BAG_VOLUME_CC = 1000
const MELPHALAN_HYDRATION_BEFORE_MINUTES = 6 * 60
const MELPHALAN_HYDRATION_AFTER_MINUTES = 12 * 60
const HDMEL_MELPHALAN_DAYS = [-3, -2] as const
const HDMEL_HYDRATION_REVIEW_DAY = -1
const HDMEL_HYDRATION_REVIEW_MINUTE = 8 * 60

type MelphalanHydrationRate = 75 | 250

export interface MelphalanStart {
  day: number
  /** 해당 날짜 00:00부터의 분 */
  minute: number
}

interface HydrationWindow {
  start: number
  end: number
}

type HydrationEvent =
  | {
      at: number
      rateCcHr: MelphalanHydrationRate
      kind: "bag-change"
      /** 속도 표기가 필요한 00:00/250ch 시작 이벤트 */
      showRate?: boolean
    }
  | {
      at: number
      rateCcHr: MelphalanHydrationRate
      kind: "rate-change"
    }
  | {
      at: number
      kind: "physician-check"
    }

interface HydrationBagState {
  remainingCc: number
  rateCcHr: MelphalanHydrationRate
  updatedAt: number
}

/**
 * 13:30 Melphalan의 -6시간은 07:30이지만
 * 사용자 예시대로 08:00 정시에 스케줄링한다.
 */
function roundToSchedulingHour(minute: number): number {
  return Math.round(minute / 60) * 60
}

/**
 * 서로 겹치거나 맞닿은 250ch 구간을 하나로 합친다.
 *
 * 예:
 * 이전 Melphalan hydration이 06:00까지이고
 * 다음 Melphalan hydration이 05:00부터이면
 * 중간에 75ch로 변경하지 않고 250ch를 계속 유지한다.
 */
function mergeHydrationWindows(
  windows: HydrationWindow[],
): HydrationWindow[] {
  const sorted = windows.slice().sort((a, b) => a.start - b.start)
  const merged: HydrationWindow[] = []

  for (const window of sorted) {
    const previous = merged[merged.length - 1]

    if (!previous || window.start > previous.end) {
      merged.push({ ...window })
      continue
    }

    previous.end = Math.max(previous.end, window.end)
  }

  return merged
}

function consumeHydrationUntil(
  state: HydrationBagState,
  targetAt: number,
): HydrationBagState {
  const elapsedMinutes = Math.max(0, targetAt - state.updatedAt)
  const infusedCc = state.rateCcHr * (elapsedMinutes / HOUR_MINUTES)

  return {
    ...state,
    remainingCc: Math.max(0, state.remainingCc - infusedCc),
    updatedAt: targetAt,
  }
}

/** 현재 속도를 유지할 때 bag이 정확히 소진되는 시각 */
function getExactBagEmptyAt(state: HydrationBagState): number {
  const remainingMinutes =
    (state.remainingCc / state.rateCcHr) * HOUR_MINUTES
  return state.updatedAt + remainingMinutes
}

/**
 * 예상 소진시각보다 늦지 않은 직전 정시로 bag 교환을 당긴다.
 * 예: 08:40 → 08:00, 09:00 → 09:00
 */
function getScheduledBagChangeAt(state: HydrationBagState): number {
  const exactEmptyAt = getExactBagEmptyAt(state)
  // 부동소수점 오차로 정확한 정시가 한 시간 전으로 내려가지 않게 보정한다.
  return Math.floor((exactEmptyAt + 1e-7) / HOUR_MINUTES) * HOUR_MINUTES
}

function formatHydrationEvent(event: HydrationEvent): string {
  const time = fromMinutes(event.at)
  if (event.kind === "physician-check") return `${time}(주치의확인)`
  if (event.kind === "rate-change") return `${time}(${event.rateCcHr}ch 속변)`
  if (event.showRate) return `${time}(${event.rateCcHr}ch)`
  return time
}

/**
 * Melphalan hydration 수행시간 계산
 *
 * - Melphalan -6시간부터 +12시간까지 250ch
 * - `속변`은 bag을 교환하지 않고 기존 잔량을 유지
 * - bag 잔량과 현재 속도로 소진시각을 계산한 뒤 직전 정시에 교환
 * - 250ch 시작 및 D-2/D-1 00:00 수행은 새 1L bag으로 교환
 * - 기본 HDMEL 모드에서는 D-1 08:00에 주치의확인을 표시하고 종료
 * - BuMel은 options의 D-6~D+3 연속 범위에서 250ch window 밖을 75ch로 유지
 */
export function buildMelphalanHydrationTimes(
  day: number,
  melphalanStarts: MelphalanStart[],
  options: {
    activeStartDay?: number
    activeEndDay?: number
    reviewDay?: number | null
  } = {},
): string[] {
  if (melphalanStarts.length === 0) return []

  const firstMelphalanDay = Math.min(...melphalanStarts.map((start) => start.day))
  const activeStartDay = options.activeStartDay ?? firstMelphalanDay
  const activeEndDay = options.activeEndDay ?? HDMEL_HYDRATION_REVIEW_DAY
  const reviewDay = options.reviewDay === undefined ? HDMEL_HYDRATION_REVIEW_DAY : options.reviewDay
  const continuousBaseline = options.activeStartDay != null || options.activeEndDay != null
  if (day < activeStartDay || day > activeEndDay) return []

  const windows = mergeHydrationWindows(
    melphalanStarts.map(({ day: melphalanDay, minute }) => {
      const melphalanAt = melphalanDay * DAY_MINUTES + minute
      return {
        start: roundToSchedulingHour(
          melphalanAt - MELPHALAN_HYDRATION_BEFORE_MINUTES,
        ),
        end: roundToSchedulingHour(
          melphalanAt + MELPHALAN_HYDRATION_AFTER_MINUTES,
        ),
      }
    }),
  )

  const dayStart = day * DAY_MINUTES
  const dayEnd = dayStart + DAY_MINUTES
  const scheduleEnd =
    reviewDay != null && day === reviewDay
      ? dayStart + HDMEL_HYDRATION_REVIEW_MINUTE
      : dayEnd
  const fixedEvents = new Map<number, HydrationEvent>()

  function addFixedEvent(event: HydrationEvent) {
    const current = fixedEvents.get(event.at)
    if (!current) {
      fixedEvents.set(event.at, event)
      return
    }

    // D-1 08:00에는 다른 이벤트 대신 주치의확인을 최종 표시한다.
    if (event.kind === "physician-check") {
      fixedEvents.set(event.at, event)
      return
    }

    // 그 외 같은 시각에는 실제 bag 교환이 속변보다 우선한다.
    if (current.kind !== "physician-check" && event.kind === "bag-change") {
      fixedEvents.set(event.at, event)
    }
  }

  const lastCarryDay = Math.max(...melphalanStarts.map((start) => start.day + 1))

  if (continuousBaseline || (day > firstMelphalanDay && day <= lastCarryDay)) {
    const rateAtMidnight: MelphalanHydrationRate = windows.some(
      (window) => window.start <= dayStart && dayStart < window.end,
    )
      ? 250
      : 75

    addFixedEvent({
      at: dayStart,
      rateCcHr: rateAtMidnight,
      kind: "bag-change",
      showRate: true,
    })
  }

  for (const window of windows) {
    if (window.start >= dayStart && window.start < scheduleEnd) {
      addFixedEvent({
        at: window.start,
        rateCcHr: 250,
        kind: "bag-change",
        showRate: true,
      })
    }

    // 자정에는 해당 날짜의 새 bag 오더가 우선하므로 별도 속변을 만들지 않는다.
    if (window.end > dayStart && window.end < scheduleEnd) {
      addFixedEvent({
        at: window.end,
        rateCcHr: 75,
        kind: "rate-change",
      })
    }
  }

  if (reviewDay != null && day === reviewDay) {
    addFixedEvent({
      at: scheduleEnd,
      kind: "physician-check",
    })
  }

  const orderedFixedEvents = [...fixedEvents.values()].sort((a, b) => a.at - b.at)
  if (orderedFixedEvents.length === 0) return []

  const schedule: HydrationEvent[] = []
  let state: HydrationBagState | null = null

  function appendBagChangesBefore(limitAt: number) {
    if (!state) return

    while (true) {
      const bagChangeAt = getScheduledBagChangeAt(state)
      if (bagChangeAt >= limitAt) break

      state = consumeHydrationUntil(state, bagChangeAt)
      schedule.push({
        at: bagChangeAt,
        rateCcHr: state.rateCcHr,
        kind: "bag-change",
      })
      state = {
        remainingCc: HYDRATION_BAG_VOLUME_CC,
        rateCcHr: state.rateCcHr,
        updatedAt: bagChangeAt,
      }
    }
  }

  for (const event of orderedFixedEvents) {
    if (state) appendBagChangesBefore(event.at)

    const consumed: HydrationBagState | null = state
      ? consumeHydrationUntil(state, event.at)
      : null
    if (event.kind === "bag-change") {
      state = {
        remainingCc: HYDRATION_BAG_VOLUME_CC,
        rateCcHr: event.rateCcHr,
        updatedAt: event.at,
      }
    } else if (event.kind === "rate-change" && consumed) {
      // 속변: 현재 bag 잔량은 그대로 두고 속도만 변경한다.
      state = {
        ...consumed,
        rateCcHr: event.rateCcHr,
      }
    }

    schedule.push(event)
  }

  // reviewDay는 주치의확인 시각까지, 그 외 날짜는 자정 전까지만 교환시간을 생성한다.
  appendBagChangesBefore(scheduleEnd)

  return schedule.sort((a, b) => a.at - b.at).map(formatHydrationEvent)
}

/**
 * 실제 Melphalan 수행시간과 선택한 활성 기간을 기준으로 hydration 시간을 계산한다.
 *
 * D-2 Melphalan 시간:
 * - 항암제 당기기 "아니오": 전일 Melphalan 수행시간 유지
 * - 항암제 당기기 "예": 레지멘의 당기기 한도를 적용
 * - 계산 결과가 11:00보다 빠르면 11:00으로 제한
 */
export function getMelphalanHydrationTimes(
  regimenId: string,
  melphalanDays: readonly number[],
  day: number,
  settings: ScheduleSettings,
  days: number[],
  options: {
    activeStartDay?: number
    activeEndDay?: number
    reviewDay?: number | null
  } = {},
): string[] {
  const starts: MelphalanStart[] =
    melphalanDays.map(
      (melphalanDay) => ({
        day: melphalanDay,

        /*
         * 같은 settings를 전달해야 D-2의 pullForward 설정이
         * 실제 Melphalan 수행시간 계산에 반영된다.
         */
        minute: getChemoStartMinutesForDay(
          regimenId,
          melphalanDay,
          days,
          settings,
        ),
      }),
    )

  return buildMelphalanHydrationTimes(
    day,
    starts,
    options,
  )
}

/** 기존 호출부 호환용 HDMEL wrapper */
export function getHdmelHydrationTimes(
  day: number,
  settings: ScheduleSettings,
  days: number[],
): string[] {
  return getMelphalanHydrationTimes(
    "hdmel",
    HDMEL_MELPHALAN_DAYS,
    day,
    settings,
    days,
  )
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
    out.push(t >= 1440 ? `${fromMinutes(t)}(전일서명)` : fromMinutes(t))
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
    name: "Tepadina 100mg inj (Thiotepa)",
    detail: "[IV] <Mix> x1 · miv over 60min",
    solvent: NS500,
    suffix: "F/ov1h",
    days: [-8, -7, -6],
    sort: 10,
    rule: { type: "chemo", durationMin: 60 },
  },
  {
    id: "busulfan",
    name: "Busulcan 60mg/10ml inj(Busulfan)",
    detail: "[MIV] <Mix> qd · miv over 3hrs",
    solvent: NS500,
    suffix: "ov3h",
    days: [-5, -4],
    sort: 10,
    rule: { type: "chemo", durationMin: 180 },
  },
    {
    id: "levetiracetam 1g",
    name: "Keppra 1g tab(Levetiracetam)",
    detail: "[P.O] · Sz prophylaxis",
    oral: true,
    noHoldFirstDose: true,
    days: [-5],
    sort: 60,
    rule: { type: "oral", freq: "qd" },
  },
  {
    id: "levetiracetam 500mg",
    name: "Keppra 500mg tab(Levetiracetam)",
    detail: "[P.O] · Sz prophylaxis",
    oral: true,
    noHoldLast: true,
    noEndMark: true,
    noHoldFirstDose: true,
    repeatDetailOnFirstDose: true,
    days: [-5],
    sort: 60,
    rule: { type: "oral", freq: "qd" },
  },
  {
    id: "levetiracetam 500mg-maintenance",
    name: "Keppra 500mg tab(Levetiracetam)",
    detail: "1 tab [P.O] bid · Sz prophylaxis",
    oral: true,
    noExtraOrder: true,
    noHoldLast: true,
    noHoldFirstDose: true,
    days: [-4, -3],
    sort: 60,
    rule: { type: "fixed", times: ["08:00", "20:00"] },
  },
  {
    id: "cyclophosphamide",
    name: "Endoxane 500mg inj(Cyclophosphamide)",
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
    name: "Dexamethasone disodium phosphate 5mg/1mL inj 유한(Dexamethasone)",
    detail: "12 mg(2.4 mL) [IV] <Mix> x1",
    solvent: NS50,
    suffix: "차",
    days: [-3],
    sort: 6,
    rule: { type: "pre-chemo", offsetMin: -30 },
  },
  {
    id: "dexamethasone 8mg",
    name: "Dexamethasone disodium phosphate 5mg/1mL inj 유한(Dexamethasone)",
    detail: "8 mg(1.6 mL) [IV] <Mix> x1",
    solvent: NS50,
    suffix: "차",
    days: [-2, -1],
    sort: 6,
    rule: { type: "pre-chemo", offsetMin: -30 },
  },
  {
    id: "mesna",
    name: "Uromitexan 400mg/4ml inj(Mesna)",
    detail: "1000mg <MIV> · q6hr",
    solvent: NS50,
    note: "Cyclophosphamide 시작 30분 전부터 q6hr ×4",
    days: [-3, -2],
    sort: 20,
    rule: { type: "mesna", ref: "cyclophosphamide" },
  },
  {
    id: "hydration-high-thiobucy",
    name: "Dextrose 5% & Na K2 1L bag(D5W/na77mEq/K20mEq)",
    detail: "[IV] 3L/m²/day hydration",
    sup: true,
    days: [-3, -2, -1, 0],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "furosemide 10mg-thiobucy",
    name: "Lasix inj 20mg (Furosemide) 10mg",
    detail: "10 mg [IV] scheduled (D-3~D0)",
    suffix: "UO>1L",
    suffixEachTime: true,
    days: [-3, -2, -1, 0],
    sort: 85,
    rule: { type: "fixed", times: ["06:00"] },
  },
  {
    id: "urine-output-thiobucy",
    name: "Check urine output q 6hr",
    detail: "if 6hr u/o <1L or <150mL/hr → furosemide 1A IVS",
    days: [-3, -2, -1, 0],
    sort: 86,
    rule: { type: "fixed", times: ["06:00", "12:00", "18:00"] },
  },
  {
    id: "ekg-monitoring-thiobucy",
    name: "EKG monitoring",
    detail: "",
    days: [-3, -2, -1, 0, 1],
    sort: 87,
    rule: { type: "ekg-monitoring", ref: "cyclophosphamide" },
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
    holdFirstDose: true,
    noHoldLast: true,
    noEndMark: true,
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
    suffix: "이식pre",
    days: [0],
    sort: 1,
    rule: { type: "fixed", times: ["14:00"] },
  },
  vitaminKOrder("vitk", [-8, -1]),
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
    name: "Dexamethasone disodium phosphate 5mg/1mL inj 유한(Dexamethasone)",
    detail: "10 mg(2 mL) [IV] <Mix> x1",
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
    note: "",
    days: [-3, -2, -1],
    sort: 80,
    rule: { type: "melphalan-hydration" },
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
    suffix: "이식pre",
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
  vitaminKOrder("vitk", [-3]),
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
    name: "Busulcan 60mg/10ml inj(Busulfan)",
    detail: "[MIV] <Mix> · miv over 3hrs",
    solvent: NS500,
    suffix: "ov3h",
    note: "",
    days: [-6, -5, -4, -3],
    sort: 11,
    rule: { type: "chemo", durationMin: 180 },
  },
  {
    id: "levetiracetam-loading-batg",
    name: "Keppra 1g tab(Levetiracetam)",
    detail: "1 tab [P.O] x1 · Busulfan 3hrs before",
    oral: true,
    holdMainOrder: true,
    noHoldFirstDose: true,
    repeatDetailOnFirstDose: true,
    days: [-6],
    sort: 55,
    rule: {
      type: "relative",
      ref: "busulfan-batg",
      offsetMin: -180,
      roundDownToHour: true,
    },
  },
  {
    id: "levetiracetam-loading-500mg-batg",
    name: "Keppra 500mg tab(Levetiracetam)",
    detail: "1 tab [P.O] x1 · Busulfan 3hrs before",
    oral: true,
    noHoldLast: true,
    noEndMark: true,
    noHoldFirstDose: true,
    repeatDetailOnFirstDose: true,
    days: [-6],
    sort: 56,
    rule: {
      type: "relative",
      ref: "busulfan-batg",
      offsetMin: -180,
      roundDownToHour: true,
    },
  },
  {
    id: "levetiracetam-500mg-batg",
    name: "Keppra 500mg tab(Levetiracetam)",
    detail: "500 mg [P.O] bid · GFR <30이면 250mg bid",
    oral: true,
    noExtraOrder: true,
    noHoldLast: true,
    noHoldFirstDose: true,
    days: [-5, -4, -3, -2],
    sort: 57,
    rule: { type: "fixed", times: ["08:00", "20:00"] },
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
    suffix: "F/ov6hr",
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
    note: "ATG 30분 전 투약 + 12시간 간격",
    days: [-3, -2, -1],
    sort: 61,
    rule: { type: "relative", ref: "atg", offsetMin: -30, repeatEveryMin: 720, count: 2 },
  },
  {
    id: "acetaminophen-atg",
    name: "Acetaminophen삼남 300mg(Acetaminophen)",
    detail: "2 tab [P.O] daily ++",
    oral: true,
    timeNote: "ATG-1hr",
    repeatDetailOnFirstDose: true,
    days: [-3, -2, -1],
    sort: 62,
    rule: { type: "relative", ref: "atg", offsetMin: -60 },
  },
  {
    id: "hydroxyzine-atg",
    name: "Adipam 10mg tab(Hydroxyzine)",
    detail: "1 tab [P.O] ut dict",
    oral: true,
    timeNote: "ATG-1hr",
    repeatDetailOnFirstDose: true,
    firstDoseDetail: "1 tab [P.O] daily hs",
    days: [-3, -2, -1],
    sort: 63,
    rule: { type: "relative", ref: "atg", offsetMin: -60 },
  },
  {
    id: "chlorpheniramine-atg",
    name: "Chlorpheniramine maleate 4mg/2mL inj유한",
    detail: "1 amp(2 mL) [IV] x1",
    timeNote: "ATG-30m",
    firstDoseExtra: true,
    repeatDetailOnFirstDose: true,
    days: [-3, -2, -1],
    sort: 64,
    rule: { type: "relative", ref: "atg", offsetMin: -30 },
  },
  {
    id: "hydrocortisone-atg",
    name: "Cortisolu 100mg inj(Hydrocortisone)",
    detail: "50 mg [IV] x1 [S]",
    timeNote: "ATG+30m",
    firstDoseExtra: true,
    repeatDetailOnFirstDose: true,
    days: [-3, -2, -1],
    sort: 65,
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
    id: "cyclosporine-batg",
    name: "Sandimmun 250mg/5ml inj(Cyclosporin A)",
    detail: "3 mg/kg/day [MIV] <Mix> x1 · continuous",
    solvent: D5W_MIX,
    suffix: "8ch",
    continuous: true,
    firstDoseExtra: true,
    repeatDetailOnFirstDose: true,
    days: [-2, -1, 0, 1, 3, 4, 6],
    donorType: "related",
    sort: 65,
    rule: { type: "fixed", times: ["09:00"] },
  },
  {
    id: "tacrolimus-batg",
    name: "Prograf 5mg/1mL inj(Tacrolimus)",
    detail: "0.04 mg/kg/day [MIV] <Mix> x1 · continuous",
    suffix: "20ch",
    solvent: NS500,
    continuous: true,
    firstDoseExtra: true,
    repeatDetailOnFirstDose: true,
    days: [-2, -1, 0, 1, 3, 4, 6],
    donorType: "unrelated",
    sort: 66,
    rule: { type: "fixed", times: ["09:00"] },
  },
  {
    id: "hydration-batg",
    name: "Dextrose 5% & Na K2 1L bag(D5W/na77mEq/K20mEq)",
    detail: "[IV] hydration",
    sup: true,
    firstTimeNote: "125ch",
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
    id: "acyclovir-batg",
    name: "진양Acyclovir 400mg tab",
    detail: "400 mg [P.O] bid",
    oral: true,
    continuous: true,
    days: [-6, -5, -4, -3, -2, -1, 0],
    sort: 72,
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
    suffix: "이식pre",
    days: [0],
    sort: 1,
    rule: { type: "fixed", times: ["17:00"] },
  },
  vitaminKOrder("vitk", [-6, 1]),
]

/* ============================================================ *
 * BuFlu-PTCy  (Fludarabine D-7~D-3, Busulfan D-7~D-4, PTCy D+3/D+4)
 * ============================================================ */
const BUFLU_PTCY_MEDS: MedDef[] = [
  {
    id: "fludarabine-ptcy",
    name: "Fludara 50mg inj(Fludarabine)",
    detail: "[IV] <Mix> x1 · over 1hr",
    solvent: NS100,
    suffix: "ov1h",
    days: [-7, -6, -5, -4, -3],
    sort: 10,
    rule: { type: "chemo", durationMin: 60 },
  },
  {
    id: "busulfan-ptcy",
    name: "Busulcan 60mg/10ml inj(Busulfan)",
    detail: "[MIV] <Mix> · miv over 3hrs",
    solvent: NS500,
    suffix: "ov3h",
    note: "Fludarabine 종료 후 연속 투약",
    days: [-7, -6, -5, -4],
    sort: 11,
    rule: { type: "chemo", durationMin: 180 },
  },
  {
    id: "levetiracetam-loading-ptcy",
    name: "Keppra 1g tab(Levetiracetam)",
    detail: "1 tab [P.O] x1 · Busulfan 3hrs before",
    oral: true,
    holdMainOrder: true,
    noHoldFirstDose: true,
    repeatDetailOnFirstDose: true,
    days: [-7],
    sort: 55,
    rule: {
      type: "relative",
      ref: "busulfan-ptcy",
      offsetMin: -180,
      roundDownToHour: true,
    },
  },
  {
    id: "levetiracetam-loading-500mg-ptcy",
    name: "Keppra 500mg tab(Levetiracetam)",
    detail: "1 tab [P.O] x1 · Busulfan 3hrs before",
    oral: true,
    noHoldLast: true,
    noEndMark: true,
    noHoldFirstDose: true,
    repeatDetailOnFirstDose: true,
    days: [-7],
    sort: 56,
    rule: {
      type: "relative",
      ref: "busulfan-ptcy",
      offsetMin: -180,
      roundDownToHour: true,
    },
  },
  {
    id: "levetiracetam-500mg-ptcy",
    name: "Keppra 500mg tab(Levetiracetam)",
    detail: "500 mg [P.O] bid · GFR <30이면 250mg bid",
    oral: true,
    noExtraOrder: true,
    noHoldLast: true,
    noHoldFirstDose: true,
    days: [-6, -5, -4, -3],
    sort: 57,
    rule: { type: "fixed", times: ["08:00", "20:00"] },
  },
  {
    id: "granisetron-ptcy",
    name: "Kanitron 3mg/3mL inj(Granisetron)      3 mg(3 mL)  [IV]   x1",
    detail: "3 mg [IV] qd",
    solvent: NS50,
    days: [-7, -6, -5, -4, -3, -2],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
  {
    id: "ptcy",
    name: "Endoxane 500mg inj(Cyclophosphamide)",
    detail: "50 mg/kg [MIV] <Mix> · miv over 1hr",
    solvent: D5W200,
    suffix: "ov1h",
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
    days: [3],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
  {
    id: "aprepitant 125mg-ptcy-post",
    name: "Emend 125mg cap(Aprepitant)",
    detail: "1 cap [P.O] daily ut dict",
    oral: true,
    days: [3],
    sort: 6,
    rule: { type: "pre-chemo", offsetMin: -60 },
  },
  {
    id: "aprepitant 80mg-ptcy-post",
    name: "Emend 80mg cap(Aprepitant)",
    detail: "1 cap [P.O] daily ut dict",
    oral: true,
    days: [4, 5],
    sort: 6,
    rule: { type: "fixed", times: ["08:00"] },
  },
  {
    id: "mesna-ptcy",
    name: "Uromitexan 400mg/4ml inj(Mesna)",
    detail: "1000mg <MIV> · q6hr",
    solvent: NS50,
    note: "Cyclophosphamide 시작 30분 전부터 q6hr ×4",
    days: [3, 4],
    sort: 20,
    rule: { type: "mesna", ref: "ptcy" },
  },
  {
    id: "hydration-conditioning-ptcy",
    name: "Dextrose 5% & Na K2 1L bag(D5W/na77mEq/K20mEq)",
    detail: "[IV] conditioning hydration · 125ch",
    sup: true,
    firstTimeNote: "125ch",
    days: [-3, -2],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "hydration-high-ptcy",
    name: "Dextrose 5% & Na K2 1L bag(D5W/na77mEq/K20mEq)",
    detail: "[IV] 3L/m²/day hydration",
    sup: true,
    days: [3, 4],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "furosemide 10mg-ptcy",
    name: "Lasix inj 20mg (Furosemide) 10mg",
    detail: "10 mg [IV] scheduled (D+3~D+4)",
    suffix: "UO>1L",
    suffixEachTime: true,
    days: [3, 4],
    sort: 85,
    rule: { type: "fixed", times: ["06:00"] },
  },
  {
    id: "urine-output-ptcy",
    name: "Check urine output q 6hr",
    detail: "if 6hr u/o < 1L or 150ml/hr → furosemide 1A ivs",
    days: [3, 4],
    sort: 86,
    rule: { type: "fixed", times: ["06:00", "12:00", "18:00"] },
  },
  {
    id: "ekg-monitoring-ptcy",
    name: "EKG monitoring",
    detail: "",
    days: [3, 4],
    sort: 87,
    rule: { type: "ekg-monitoring", ref: "ptcy" },
  },
  {
    id: "cyclosporine-ptcy",
    name: "Sandimmun 250mg/5ml inj(Cyclosporin A)",
    detail: "3 mg/kg/day [MIV] <Mix> x1 · D+5부터",
    solvent: D5W200,
    suffix: "8ch",
    continuous: true,
    firstDoseExtra: true,
    repeatDetailOnFirstDose: true,
    note: "GVHD prophylaxis (CNI) — PTCy 종료 후 개시",
    days: [5],
    donorType: "related",
    sort: 65,
    rule: { type: "fixed", times: ["09:00"] },
  },
  {
    id: "tacrolimus-ptcy",
    name: "Prograf 5mg/1mL inj(Tacrolimus)",
    detail: "0.04 mg/kg/day [MIV] <Mix> x1 · D+5부터",
    solvent: NS500,
    suffix: "20ch",
    continuous: true,
    firstDoseExtra: true,
    repeatDetailOnFirstDose: true,
    note: "GVHD prophylaxis (CNI) — PTCy 종료 후 개시",
    days: [5],
    donorType: "unrelated",
    sort: 66,
    rule: { type: "fixed", times: ["09:00"] },
  },
  {
    id: "mmf-ptcy",
    name: "Mycophenolate mofetil cap 500mg",
    detail: "15 mg/kg [P.O] tid · D+5 ~ D+35",
    oral: true,
    continuous: true,
    days: [5],
    sort: 67,
    rule: { type: "fixed", times: ["07:00", "14:00", "22:00"] },
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
    id: "acyclovir-ptcy",
    name: "진양Acyclovir 400mg tab",
    detail: "400 mg [P.O] bid",
    oral: true,
    continuous: true,
    days: [-6, -5, -4, -3, -2, -1, 0, 3, 4],
    sort: 72,
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
    suffix: "이식pre",
    days: [0],
    sort: 1,
    rule: { type: "fixed", times: ["17:00"] },
  },
  {
    id: "grasin-ptcy",
    name: "Grasin 300mcg/0.7mL PFS(Filgrastim)",
    detail: "300 mcg(0.7 mL) [IV] x1",
    bundleItems: [
      {
        name: "Grasin 150mcg/0.6mL PFS(Filgrastim)",
        detail: "150 mcg(0.6 mL) [IV] x1",
      },
      {
        name: "Dextrose 5% 50mL bag 중외",
        detail: "1 bag [IV] x1",
      },
    ],
    days: [5],
    sort: 78,
    rule: { type: "fixed", times: ["14:00"] },
  },
  vitaminKOrder("vitk", [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]),
]

/* ============================================================ *
 * BuCyEto  (AutoSCT)
 * ============================================================ */
const BUCYETO_MEDS: MedDef[] = [
  {
    id: "busulfan-bucyeto",
    name: "Busulcan 60mg/10ml inj(Busulfan)",
    detail: "[MIV] <Mix> qd · miv over 3hrs",
    solvent: NS_MIX,
    suffix: "ov3h",
    days: [-7, -6, -5],
    sort: 10,
    rule: { type: "chemo", durationMin: 180, order: 10 },
  },
  {
    id: "etoposide-bucyeto",
    name: "E.P.S 100mg/5ml inj(Etoposide)",
    detail: "[MIV] <Mix> x2 · 2.5hrs씩 연속 투약",
    solvent: NS_TWO_BAG_MIX,
    suffix: "ov2.5hr",
    suffixEachTime: true,
    splitInfusion: { count: 2, intervalMin: 150 },
    note: "N/S 2L (200mg/m2+NS 1L x2로 처방, 희석농도 0.4mg/ml 이하 유지",
    days: [-5, -4],
    sort: 11,
    rule: { type: "chemo", durationMin: 300, order: 20 },
  },
  {
    id: "cyclophosphamide-bucyeto",
    name: "Endoxane 500mg inj(Cyclophosphamide)",
    detail: "[MIV] <Mix> · miv over 1hr",
    solvent: D5W_MIX,
    suffix: "ov1h",
    days: [-3, -2],
    sort: 10,
    rule: { type: "chemo", durationMin: 60, order: 10 },
  },
  {
    id: "levetiracetam-loading-bucyeto",
    name: "Keppra 1g tab(Levetiracetam)",
    detail: "1 tab [P.O] x1 · Busulfan 3hrs before",
    oral: true,
    holdMainOrder: true,
    noHoldFirstDose: true,
    repeatDetailOnFirstDose: true,
    days: [-7],
    sort: 55,
    rule: {
      type: "relative",
      ref: "busulfan-bucyeto",
      offsetMin: -180,
      roundDownToHour: true,
    },
  },
  {
    id: "levetiracetam-loading-500mg-bucyeto",
    name: "Keppra 500mg tab(Levetiracetam)",
    detail: "1 tab [P.O] x1 · Busulfan 3hrs before",
    oral: true,
    noHoldLast: true,
    noEndMark: true,
    noHoldFirstDose: true,
    repeatDetailOnFirstDose: true,
    days: [-7],
    sort: 56,
    rule: {
      type: "relative",
      ref: "busulfan-bucyeto",
      offsetMin: -180,
      roundDownToHour: true,
    },
  },
  {
    id: "levetiracetam-500mg-bucyeto",
    name: "Keppra 500mg tab(Levetiracetam)",
    detail: "500 mg [P.O] bid · GFR <30이면 250mg bid",
    oral: true,
    noExtraOrder: true,
    noHoldLast: true,
    noHoldFirstDose: true,
    days: [-6, -5, -4],
    sort: 57,
    rule: { type: "fixed", times: ["08:00", "20:00"] },
  },
  {
    id: "granisetron-iv-bucyeto",
    name: "Kanitron 3mg/3mL inj (Granisetron)",
    detail: "3 mg [IV] qd",
    solvent: NS_MIX,
    days: [-7, -6, -5, -4, -3],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
  {
    id: "aprepitant 125mg-bucyeto",
    name: "Emend 125mg cap (Aprepitant)",
    detail: "1 cap [P.O] daily ut dict",
    oral: true,
    days: [-3],
    sort: 6,
    rule: { type: "pre-chemo", offsetMin: -60 },
  },
  {
    id: "aprepitant 80mg-bucyeto",
    name: "Emend 80mg cap (Aprepitant)",
    detail: "1 cap [P.O] daily ut dict",
    oral: true,
    days: [-2, -1],
    sort: 6,
    rule: { type: "fixed", times: ["08:00"] },
  },
  {
    id: "dexamethasone 12mg-bucyeto",
    name: "Dexamethasone disodium phosphate 5mg/1mL inj 유한(Dexamethasone)",
    detail: "12 mg(2.4 mL) [IV] <Mix> x1",
    solvent: NS50,
    suffix: "차",
    days: [-3],
    sort: 7,
    rule: { type: "pre-chemo", offsetMin: -30 },
  },
  {
    id: "dexamethasone 8mg-bucyeto",
    name: "Dexamethasone disodium phosphate 5mg/1mL inj 유한(Dexamethasone)",
    detail: "8 mg(1.6 mL) [IV] <Mix> x1",
    solvent: NS50,
    days: [-2, -1],
    sort: 7,
    rule: { type: "pre-chemo", offsetMin: -30 },
  },
  {
    id: "dexamethasone 8mg-bucyeto",
    name: "Dexamethasone disodium phosphate 5mg/1mL inj 유한(Dexamethasone)",
    detail: "8 mg(1.6 mL) [IV] <Mix> x1",
    solvent: NS50,
    days: [0],
    sort: 7,
    rule: { type: "fixed", times: ["11:00"] },
  },
  {
    id: "mesna-bucyeto",
    name: "Uromitexan 400mg/4ml inj(Mesna)",
    detail: "1000 mg [MIV] <Mix> q6hr",
    solvent: NS_MIX,
    note: "Cyclophosphamide 시작 30분 전부터 q6hr ×4",
    days: [-3, -2],
    sort: 20,
    rule: { type: "mesna", ref: "cyclophosphamide-bucyeto" },
  },
  {
    id: "hydration-high-bucyeto",
    name: "Dextrose 5% & Na K2 1L bag(D5W/na77mEq/K20mEq)",
    detail: "[IV] 3L/m²/day hydration",
    sup: true,
    days: [-3, -2, -1, 0],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "hydration-low-bucyeto",
    name: "Dextrose 5% & Na K2 1L bag(D5W/na77mEq/K20mEq)",
    detail: "[IV] 1.5L/m²/day hydration · 이후 tapering",
    sup: true,
    days: [1, 2, 3, 4],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 63 },
  },
  {
    id: "furosemide 10mg-bucyeto",
    name: "Lasix inj 20mg (Furosemide) 10mg",
    detail: "10 mg [IV] scheduled (D-3~D0)",
    suffix: "UO>1L",
    suffixEachTime: true,
    days: [-3, -2, -1, 0],
    sort: 85,
    rule: { type: "fixed", times: ["06:00"] },
  },
  {
    id: "urine-output-bucyeto",
    name: "Check urine output q 6hr",
    detail: "if 6hr u/o <1L or <150mL/hr → furosemide 1A IVS",
    days: [-3, -2, -1, 0],
    sort: 86,
    rule: { type: "fixed", times: ["06:00", "12:00", "18:00"] },
  },
  {
    id: "citopcin-bucyeto",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    oral: true,
    continuous: true,
    days: [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4],
    sort: 70,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "ursa-bucyeto",
    name: "Ursa 200mg tab (UDCA)",
    detail: "200 mg [P.O] tid · VOD prophylaxis",
    oral: true,
    continuous: true,
    days: [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4],
    sort: 71,
    rule: { type: "oral", freq: "tid" },
  },
  {
    id: "mycamine-bucyeto",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    solvent: NS_MIX,
    continuous: true,
    days: [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4],
    sort: 75,
    rule: { type: "mycamine" },
  },
  {
    id: "stemcell-auto-bucyeto",
    name: "자가말초혈액조혈모세포 주입술",
    detail: "[IV] x1 · over 15–30min per bag",
    days: [0],
    sort: 0,
    rule: { type: "fixed", times: ["14:00"] },
  },
  {
    id: "stemcell-premed-bucyeto",
    name: "CChlorpheniramine maleate 4mg/2mg inj유한",
    detail: "4 mg [IVS] x1",
    suffix: "이식pre",
    days: [0],
    sort: 1,
    rule: { type: "relative", ref: "stemcell-auto-bucyeto", offsetMin: 0 },
  },
  vitaminKOrder("bucyeto-vitk", [-7, 0]),
]

/* ============================================================ *
 * BuMel  (AutoSCT)
 * ============================================================ */
const BUMEL_MEDS: MedDef[] = [
  {
    id: "busulfan-bumel",
    name: "Busulcan 60mg/10ml inj(Busulfan)",
    detail: "[MIV] <Mix> qd · miv over 3hrs",
    solvent: NS_MIX,
    suffix: "ov3h",
    days: [-6, -5, -4],
    sort: 10,
    rule: { type: "chemo", durationMin: 180, order: 10 },
  },
  {
    id: "levetiracetam-loading-bumel",
    name: "Keppra 1g tab(Levetiracetam)",
    detail: "1 tab [P.O] x1 · Busulfan 3hrs before",
    oral: true,
    holdMainOrder: true,
    noHoldFirstDose: true,
    repeatDetailOnFirstDose: true,
    days: [-6],
    sort: 55,
    rule: {
      type: "relative",
      ref: "busulfan-bumel",
      offsetMin: -180,
      roundDownToHour: true,
    },
  },
  {
    id: "levetiracetam-loading-500mg-bumel",
    name: "Keppra 500mg tab(Levetiracetam)",
    detail: "1 tab [P.O] x1 · Busulfan 3hrs before",
    oral: true,
    noHoldLast: true,
    noEndMark: true,
    noHoldFirstDose: true,
    repeatDetailOnFirstDose: true,
    days: [-6],
    sort: 56,
    rule: {
      type: "relative",
      ref: "busulfan-bumel",
      offsetMin: -180,
      roundDownToHour: true,
    },
  },
  {
    id: "levetiracetam-500mg-bumel",
    name: "Keppra 500mg tab(Levetiracetam)",
    detail: "500 mg [P.O] bid · GFR <30이면 250mg bid",
    oral: true,
    noExtraOrder: true,
    noHoldLast: true,
    noHoldFirstDose: true,
    days: [-5, -4, -3],
    sort: 57,
    rule: { type: "fixed", times: ["08:00", "20:00"] },
  },
  {
    id: "melphalan-bumel",
    name: "Megval 50mg inj (Melphalan)",
    detail: "[MIV] <Mix> · miv over 30min",
    solvent: NS_MIX,
    suffix: "얼차ov30m",
    note: "GFR 30–50mL/min: 50mg/m²/day 감량; GFR <30mL/min: 투여 중지",
    days: [-3, -2],
    sort: 10,
    rule: { type: "chemo", durationMin: 30, order: 10 },
  },
  {
    id: "granisetron-iv-bumel",
    name: "Kanitron 3mg/3mL inj (Granisetron)",
    detail: "3 mg [IV] qd",
    solvent: NS_MIX,
    days: [-6, -5, -4, -3, -2],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
  {
    id: "granisetron-po-bumel",
    name: "Kanitron tab 1mg (Granisetron)",
    detail: "1 mg [P.O] qd · IV와 동일 성분",
    oral: true,
    days: [-1, 0],
    sort: 5,
    rule: { type: "fixed", times: ["08:00"] },
  },
  {
    id: "hydration-high-bumel",
    name: "Dextrose 5% & Na K2 1L bag(D5W/Na77mEq/K20mEq)",
    detail: "[IV] 3L/m²/day hydration",
    sup: true,
    days: [-6, -5, -4, -3, -2, -1, 0],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "hydration-low-bumel",
    name: "Dextrose 5% & Na K2 1L bag(D5W/Na77mEq/K20mEq)",
    detail: "[IV] 1.5L/m²/day hydration",
    sup: true,
    days: [1, 2, 3],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 63 },
  },
  {
    id: "furosemide 10mg-bumel",
    name: "Lasix inj 20mg (Furosemide) 10mg",
    detail: "10 mg [IVS] PRN · if 6hr u/o <1L",
    tit: true,
    days: [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3],
    sort: 85,
    rule: { type: "fixed", times: [] },
  },
  {
    id: "urine-output-bumel",
    name: "Check urine output and urine pH q 6hr",
    detail: "if 6hr u/o <1L → furosemide 1A IV",
    days: [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3],
    sort: 86,
    rule: { type: "fixed", times: ["06:00", "12:00", "18:00"] },
  },
  {
    id: "ursa-bumel",
    name: "Ursa 300mg tab (UDCA)",
    detail: "300 mg [P.O] tid · VOD prophylaxis",
    oral: true,
    continuous: true,
    days: [-6, -5, -4, -3, -2, -1, 0],
    sort: 71,
    rule: { type: "oral", freq: "tid" },
  },
  {
    id: "citopcin-bumel",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    oral: true,
    continuous: true,
    days: [-6, -5, -4, -3, -2, -1, 0],
    sort: 70,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "mycamine-bumel",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    solvent: NS_MIX,
    continuous: true,
    days: [-6, -5, -4, -3, -2, -1, 0],
    sort: 75,
    rule: { type: "mycamine" },
  },
  {
    id: "ivig-bumel",
    name: "IVIg (Human immunoglobulin)",
    detail: "500 mg/kg [IV] · D+7부터 2주 간격",
    note: "CMV prophylaxis 기본 계획; 이후 간격/기간은 원문 및 지정의 확인",
    days: [7],
    sort: 40,
    rule: { type: "fixed", times: ["10:00"] },
  },
  {
    id: "stemcell-auto-bumel",
    name: "자가말초혈액조혈모세포 주입술",
    detail: "[IV] x1 · over 15–30min per bag",
    days: [0],
    sort: 0,
    rule: { type: "fixed", times: ["14:00"] },
  },
  {
    id: "stemcell-premed-bumel",
    name: "Chlorpheniramine maleate 4mg/2mg inj유한",
    detail: "4 mg [IVS] x1 ",
    suffix: "이식pre",
    days: [0],
    sort: 1,
    rule: { type: "relative", ref: "stemcell-auto-bumel", offsetMin: 0 },
  },
  vitaminKOrder("bumel-vitk", [-6, 1]),
]

/* ============================================================ *
 * TBI-Cy  (AlloSCT)
 * ============================================================ */
const TBI_CY_ORDER_DAYS = [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 3, 6]

const TBI_CY_MEDS: MedDef[] = [
  {
    id: "tbi",
    name: "Total Body Irradiation (TBI)",
    detail: "Radiation treatment · send to TR with H-cath capped",
    days: [-7, -6, -5, -4],
    sort: 10,
    rule: { type: "fixed", times: ["00:00"] },
  },
  {
    id: "tbi-acetaminophen",
    name: "Tacenol ER 650mg tab_8hours(Acetaminophen)",
    detail: "1 tab [P.O] · TBI premed",
    oral: true,
    holdFirstDose: true,
    repeatDetailOnFirstDose: true,
    noHoldLast: true,
    noEndMark: true,
    note: "",
    days: [-7, -6, -5, -4],
    sort: 1,
    rule: { type: "fixed", times: ["16:00"] },
  },
  {
    id: "tbi-diazepam",
    name: "Diazepam 5mg tab(Diazepam)",
    detail: "2 tab [P.O] · TBI premed",
    oral: true,
    controlled: true,
    holdFirstDose: true,
    repeatDetailOnFirstDose: true,
    noHoldLast: true,
    noEndMark: true,
    note: "",
    days: [-7, -6, -5, -4],
    sort: 2,
    rule: { type: "fixed", times: ["16:00"] },
  },
  {
    id: "tbi-hydrocortisone",
    name: "Cortisolu 100mg inj(Hydrocortisone)",
    detail: "100 mg [IV] · TBI premed",
    firstDoseExtra: true,
    holdFirstDose: true,
    repeatDetailOnFirstDose: true,
    noHoldLast: true,
    noEndMark: true,
    note: "",
    days: [-7, -6, -5, -4],
    sort: 3,
    rule: { type: "fixed", times: ["16:00"] },
  },
  {
    id: "tbi-metoclopramide",
    name: "Meckool 10mg/2ml inj(Metoclopramide)",
    detail: "10 mg [IV] · TBI premed",
    suffix: "ns50",
    firstDoseExtra: true,
    holdFirstDose: true,
    repeatDetailOnFirstDose: true,
    noHoldLast: true,
    noEndMark: true,
    note: "",
    days: [-7, -6, -5, -4],
    sort: 4,
    rule: { type: "fixed", times: ["16:00"] },
  },
  {
    id: "tbi-diazepam-prn",
    name: "Diazepam 10mg/2mL inj 삼진(Diazepam)",
    detail: "",
    controlled: true,
    prnBadge: true,
    days: [-7, -6, -5, -4],
    sort: 6,
    rule: { type: "fixed", times: [] },
  },
  {
    id: "granisetron-iv-tbi",
    name: "Kanitron 3mg/3mL inj (Granisetron)",
    detail: "3 mg [IV] qd · TBI antiemetic",
    solvent: NS_MIX,
    suffix: "단독",
    days: [-7, -6, -5, -4],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "fixed", times: ["11:00"] },
  },
  {
    id: "cyclophosphamide-tbi-cy",
    name: "Endoxane 500mg inj(Cyclophosphamide)",
    detail: "[MIV] <Mix> · miv over 1hr",
    solvent: D5W200,
    suffix: "ov1h",
    timeNote: "얼음/EKG",
    days: [-3, -2],
    sort: 10,
    rule: { type: "chemo", durationMin: 60, order: 10 },
  },
  {
    id: "granisetron-iv-tbi-cy",
    name: "Kanitron 3mg/3mL inj (Granisetron)",
    detail: "3 mg [IV] qd",
    solvent: NS_MIX,
    days: [-3],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
  {
    id: "aprepitant 125mg-tbi-cy",
    name: "Emend 125mg cap (Aprepitant)",
    detail: "1 cap [P.O] daily ut dict",
    oral: true,
    days: [-3],
    sort: 6,
    rule: { type: "pre-chemo", offsetMin: -60 },
  },
  {
    id: "aprepitant 80mg-tbi-cy",
    name: "Emend 80mg cap (Aprepitant)",
    detail: "1 cap [P.O] daily ut dict",
    oral: true,
    days: [-2, -1],
    sort: 6,
    rule: { type: "fixed", times: ["08:00"] },
  },
  {
    id: "dexamethasone 12mg-tbi-cy",
    name: "Dexamethasone disodium phosphate 5mg/1mL inj 유한(Dexamethasone)",
    detail: "12 mg(2.4 mL) [IV] <Mix> x1",
    solvent: NS50,
    suffix: "차",
    days: [-3],
    sort: 7,
    rule: { type: "pre-chemo", offsetMin: -30 },
  },
  {
    id: "dexamethasone 8mg-tbi-cy",
    name: "Dexamethasone disodium phosphate 5mg/1mL inj 유한(Dexamethasone)",
    detail: "8 mg(1.6 mL) [IV] <Mix> x1",
    solvent: NS50,
    days: [-2, -1, 0],
    sort: 7,
    rule: { type: "fixed", times: ["11:00"] },
  },
  {
    id: "mesna-tbi-cy",
    name: "Uromitexan 400mg/4ml inj(Mesna)",
    detail: "1000 mg [MIV] <Mix> q6hr",
    solvent: NS_MIX,
    note: "Cyclophosphamide 시작 30분 전부터 q6hr ×4",
    days: [-3, -2],
    sort: 20,
    rule: { type: "mesna", ref: "cyclophosphamide-tbi-cy" },
  },
  {
    id: "hydration-high-tbi-cy",
    name: "Dextrose 5% & Na K2 1L bag(D5W/na77mEq/K20mEq)",
    detail: "[IV] 3L/m²/day hydration",
    sup: true,
    days: [-3, -2, -1, 0],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 125 },
  },
  {
    id: "hydration-low-tbi-cy",
    name: "Dextrose 5% & Na K2 1L bag(D5W/na77mEq/K20mEq)",
    detail: "[IV] 1.5L/m²/day hydration · 이후 tapering",
    sup: true,
    days: [1, 2, 3, 4],
    sort: 80,
    rule: { type: "hydration", rateCcHr: 63 },
  },
  {
    id: "furosemide 10mg-tbi-cy",
    name: "Lasix inj 20mg (Furosemide) 10mg",
    detail: "10 mg [IVS] scheduled (D-3~D0); urine-output threshold 확인",
    suffix: "UO>1L",
    suffixEachTime: true,
    days: [-3, -2, -1, 0],
    sort: 85,
    rule: { type: "fixed", times: ["06:00"] },
  },
  {
    id: "urine-output-tbi-cy",
    name: "Check urine output q 6hr",
    detail: "if 6hr u/o <1L or <150mL/hr → furosemide 1A IVS",
    days: [-3, -2, -1, 0],
    sort: 86,
    rule: { type: "fixed", times: ["06:00", "12:00", "18:00"] },
  },
  {
    id: "ekg-monitoring-tbi-cy",
    name: "EKG monitoring",
    detail: "",
    days: [-3, -2, -1, 0, 1],
    sort: 87,
    rule: { type: "ekg-monitoring", ref: "cyclophosphamide-tbi-cy" },
  },
  {
    id: "atg-tbi-cy",
    name: "Thymoglobulin 25mg(Antithymocyteglobulin rabbit)",
    detail: "[MIV] <Mix> · over 6hrs via I-med",
    solvent: NS_MIX,
    suffix: "F/ov6hr",
    note: "Unrelated donor에서 지정의 confirm 후 사용.",
    days: [-3, -2],
    donorType: "unrelated",
    sort: 12,
    rule: { type: "chemo", durationMin: 360, order: 20 },
  },
  {
    id: "mpred-tbi-cy",
    name: "Methylprednisolone sodium succinate inj",
    detail: "1 mg/kg [MIV] <Mix> · over 30min q12hr",
    solvent: D5W_MIX,
    note: "ATG 30분 전부터 q12hr ×2 (daily 2mg/kg)",
    days: [-3, -2],
    donorType: "unrelated",
    sort: 30,
    rule: { type: "relative", ref: "atg-tbi-cy", offsetMin: -30, repeatEveryMin: 720, count: 2 },
  },
  {
    id: "acetaminophen-atg-tbi-cy",
    name: "Acetaminophen삼남 300mg(Acetaminophen)",
    detail: "2 tab [P.O] daily ++",
    oral: true,
    timeNote: "ATG-1hr",
    repeatDetailOnFirstDose: true,
    days: [-3, -2],
    donorType: "unrelated",
    sort: 31,
    rule: { type: "relative", ref: "atg-tbi-cy", offsetMin: -60 },
  },
  {
    id: "hydroxyzine-atg-tbi-cy",
    name: "Adipam 10mg tab(Hydroxyzine)",
    detail: "1 tab [P.O] ut dict",
    oral: true,
    timeNote: "ATG-1hr",
    repeatDetailOnFirstDose: true,
    firstDoseDetail: "1 tab [P.O] daily hs",
    days: [-3, -2],
    donorType: "unrelated",
    sort: 32,
    rule: { type: "relative", ref: "atg-tbi-cy", offsetMin: -60 },
  },
  {
    id: "chlorpheniramine-atg-tbi-cy",
    name: "Chlorpheniramine maleate 4mg/2mL inj유한",
    detail: "1 amp(2 mL) [IV] x1",
    timeNote: "ATG-30m",
    firstDoseExtra: true,
    repeatDetailOnFirstDose: true,
    days: [-3, -2],
    donorType: "unrelated",
    sort: 33,
    rule: { type: "relative", ref: "atg-tbi-cy", offsetMin: -30 },
  },
  {
    id: "hydrocortisone-atg-tbi-cy",
    name: "Cortisolu 100mg inj(Hydrocortisone)",
    detail: "50 mg [IV] x1 [S]",
    timeNote: "ATG+30m",
    firstDoseExtra: true,
    repeatDetailOnFirstDose: true,
    days: [-3, -2],
    donorType: "unrelated",
    sort: 34,
    rule: { type: "relative", ref: "atg-tbi-cy", offsetMin: 30 },
  },
  {
    id: "cyclosporine-tbi-cy",
    name: "Sandimmun 250mg/5ml inj(Cyclosporin A)",
    detail: "3 mg/kg/day [MIV]",
    suffix: "8ch",
    solvent: D5W200,
    continuous: true,
    firstDoseExtra: true,
    repeatDetailOnFirstDose: true,
    note: "",
    days: [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
    donorType: "related",
    sort: 40,
    rule: { type: "fixed", times: ["09:00"] },
  },
  {
    id: "tacrolimus-tbi-cy",
    name: "Prograf inj (Tacrolimus)",
    detail: "0.04 mg/kg/day [MIV]",
    solvent: NS500,
    suffix: "20ch",
    continuous: true,
    firstDoseExtra: true,
    repeatDetailOnFirstDose: true,
    note: "",
    days: [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
    donorType: "unrelated",
    sort: 41,
    rule: { type: "fixed", times: ["09:00"] },
  },
  {
    id: "mtx-d1-tbi-cy",
    name: "Pfizer Methotrexate 50mg/2mL inj(Methotrexate)",
    detail: "15 mg/m² [IVP] · GVHD prophylaxis",
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
    id: "mtx-d3d6-tbi-cy",
    name: "Pfizer Methotrexate 50mg/2mL inj(Methotrexate)",
    detail: "10 mg/m² [IVP] · GVHD prophylaxis",
    days: [3, 6],
    sort: 13,
    rule: { type: "fixed", times: ["11:00"] },
  },
  {
    id: "stemcell-allo-tbi-cy",
    name: "동종말초혈액조혈모세포 주입술",
    detail: "[IV] x1 · over 5–15min per bag",
    days: [0],
    sort: 0,
    rule: { type: "fixed", times: ["17:00"] },
  },
  {
    id: "stemcell-premed-tbi-cy",
    name: "Chlorpheniramine maleate 4mg/2mL inj",
    detail: "4 mg [IVS] x1 ",
    suffix: "이식pre",
    days: [0],
    sort: 1,
    rule: { type: "relative", ref: "stemcell-allo-tbi-cy", offsetMin: 0 },
  },
  {
    id: "citopcin-tbi-cy",
    name: "Citopcin 250mg tab (Ciprofloxacin)",
    detail: "500 mg [P.O] bid q12h",
    oral: true,
    continuous: true,
    days: [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
    sort: 70,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "ursa-tbi-cy",
    name: "Ursa 200mg tab (UDCA)",
    detail: "200 mg [P.O] tid · VOD prophylaxis",
    oral: true,
    continuous: true,
    days: [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
    sort: 71,
    rule: { type: "oral", freq: "tid" },
  },
  {
    id: "acyclovir-tbi-cy",
    name: "진양Acyclovir 400mg tab",
    detail: "400 mg [P.O] bid · HSV prophylaxis",
    oral: true,
    continuous: true,
    days: [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
    sort: 72,
    rule: { type: "oral", freq: "bid" },
  },
  {
    id: "mycamine-tbi-cy",
    name: "Mycamine 50mg inj (Micafungin)",
    detail: "50 mg [MIV] <Mix> q24h",
    solvent: NS_MIX,
    continuous: true,
    days: [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
    sort: 75,
    rule: { type: "mycamine" },
  },
  {
    id: "letermovir-tbi-cy",
    name: "Prevymis (Letermovir)",
    detail: "240 mg [P.O] qd · D+7~D+100 · Cyclosporine 병용",
    oral: true,
    continuous: true,
    noExtraOrder: true,
    note: "CMV IgG(+)이고 D0 CMV PCR 음성인 경우만. Cyclosporine 병용 감량 용량.",
    days: [7],
    donorType: "related",
    sort: 76,
    rule: { type: "fixed", times: ["08:00"] },
  },
  {
    id: "letermovir-tbi-cy",
    name: "Prevymis (Letermovir)",
    detail: "480 mg [P.O] qd · D+7~D+100",
    oral: true,
    continuous: true,
    noExtraOrder: true,
    note: "CMV IgG(+)이고 D0 CMV PCR 음성인 경우만.",
    days: [7],
    donorType: "unrelated",
    sort: 76,
    rule: { type: "fixed", times: ["08:00"] },
  },
  {
    id: "grasin-tbi-cy",
    name: "Grasin 300mcg/0.7mL PFS(Filgrastim)",
    detail: "300 mcg(0.7 mL) [IV] x1",
    bundleItems: [
      {
        name: "Grasin 150mcg/0.6mL PFS(Filgrastim)",
        detail: "150 mcg(0.6 mL) [IV] x1",
      },
      {
        name: "Dextrose 5% 50mL bag 중외",
        detail: "1 bag [IV] x1",
      },
    ],
    days: [1, 3, 6],
    sort: 78,
    rule: { type: "fixed", times: ["14:00"] },
  },
  vitaminKOrder("vitk", TBI_CY_ORDER_DAYS),
]

/* ============================================================ *
 * FC  (CAR-T lymphodepletion)
 * ============================================================ */
const FC_MEDS: MedDef[] = [
  {
    id: "fludarabine-fc",
    name: "Fludara 50mg inj (Fludarabine)",
    detail: " <Mix> · over 30min",
    solvent: NS_MIX,
    suffix: "ov30m",
    days: [-5, -4, -3],
    sort: 10,
    rule: { type: "chemo", durationMin: 30, order: 10 },
  },
  {
    id: "cyclophosphamide-fc",
    name: "Endoxane 500mg inj(Cyclophosphamide)",
    detail: "[MIV] <Mix> · over 30min",
    solvent: D5W_MIX,
    suffix: "ov30m",
    note: "Fludarabine 종료 직후 연속 투약",
    days: [-5, -4, -3],
    sort: 11,
    rule: { type: "chemo", durationMin: 30, order: 20 },
  },
  {
    id: "kymirah-cell-infusion-fc",
    name: "Kymirah inj(Tisagenlecleucel)",
    detail: "",
    days: [1],
    sort: 20,
    rule: { type: "fixed", times: ["14:00"] },
  },
  {
    id: "chlorpheniramine-cell-infusion-fc",
    name: "Chlorpheniramine maleate 4mg/2mg inj유한",
    detail: "1 amp(2ml) [IV] x1",
    suffix: "이식pre",
    days: [1],
    sort: 21,
    firstDoseExtra: true,
    repeatDetailOnFirstDose: true,
    rule: { type: "fixed", times: ["13:00"] },
  },
  {
    id: "tacenol-cell-infusion-fc",
    name: "Tacenol ER 650mg tab_8hours(Acetaminophen)",
    detail: "1 tab [PO] daily",
    oral: true,
    days: [1],
    sort: 22,
    repeatDetailOnFirstDose: true,
    rule: { type: "fixed", times: ["13:30"] },
  },
  {
    id: "granisetron-iv-fc",
    name: "Kanitron 3mg/3mL inj (Granisetron)",
    detail: "3 mg [IV] qd",
    solvent: NS_MIX,
    days: [-5, -4, -3],
    sort: 5,
    firstDoseExtra: true,
    rule: { type: "antiemetic-iv" },
  },
  {
    id: "granisetron-po-fc",
    name: "Kanitron tab 1mg (Granisetron)",
    detail: "1 mg [P.O] qd · IV와 동일 성분",
    oral: true,
    days: [-2, -1, 1],
    sort: 5,
    rule: { type: "fixed", times: ["08:00"] },
  },
  {
    id: "tmp-smx-fc",
    name: "Septrin 480mg(Sulfamethoxazole 400mg/Trimethoprim 80mg) tab",
    detail: "1 tab [P.O] daily · PCP prophylaxis",
    oral: true,
    continuous: true,
    days: [-5, -4, -3, -2, -1, 1],
    sort: 70,
    rule: { type: "oral", freq: "qd" },
  },
  {
    id: "fluconazole-fc",
    name: "Funazol 50mg(fluconazole)",
    detail: "1 cap [P.O] qd · fungal prophylaxis",
    bundleItems: [
      {
        name: "Plunazole 150mg(fluconazole)",
        detail: "1 tab [P.O] qd · fungal prophylaxis",
      },
    ],
    oral: true,
    continuous: true,
    repeatDetailOnFirstDose: true,
    days: [-5, -4, -3, -2, -1, 1],
    sort: 71,
    rule: { type: "oral", freq: "qd" },
  },
  {
    id: "acyclovir-fc",
    name: "진양Acyclovir 400mg tab",
    detail: "400 mg [P.O] qd · antiviral prophylaxis",
    oral: true,
    continuous: true,
    days: [-5, -4, -3, -2, -1, 1],
    sort: 72,
    rule: { type: "oral", freq: "qd" },
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
  bucyeto: BUCYETO_MEDS,
  bumel: BUMEL_MEDS,
  "tbi-cy": TBI_CY_MEDS,
  fc: FC_MEDS,
}

/** Auto 레지멘 공통 D0 오더 */
const AUTO_D0_MEDS: MedDef[] = [
  {
    id: "stemcell-water-irrigation-auto-d0",
    name: "Water for Irrigation 1L 중외",
    detail: "10 btl [Apply] ut dict daily ",
    days: [0],
    sort: 2,
    rule: { type: "fixed", times: [] },
  },
]

function medsForRegimen(regimenId: string): MedDef[] | null {
  const meds = REGIMEN_MEDS[regimenId]
  if (!meds) return null
  const allMeds = isAutoRegimen(regimenId) ? [...meds, ...AUTO_D0_MEDS] : [...meds]
  const allOrderDays = [
    ...new Set(allMeds.flatMap((med) => med.days)),
  ].sort((a, b) => a - b)
  const hasVitaminK = allMeds.some((med) => med.name.startsWith("Vitamin K1"))

  // Vit. K는 레지멘별 개별 날짜 목록과 무관하게 모든 오더 날짜에 항상 표시한다.
  if (!hasVitaminK) return [...allMeds, vitaminKOrder("vitk", allOrderDays)]
  return allMeds.map((med) =>
    med.name.startsWith("Vitamin K1") ? { ...med, days: allOrderDays } : med,
  )
}

/**
 * 전날 실제 Mesna 오더가 있었고 오늘은 없는 경우, 원문 Mesna 행에만
 * 전일서명 수행시간을 표시한다. 연속 투약 중간 날짜는 제외된다.
 */
export function getMesnaCarryoverMedIds(
  regimenId: string | null,
  day: number,
  donorType: ScheduleSettings["donorType"] = null,
): string[] {
  if (!regimenId) return []
  const meds = medsForRegimen(regimenId)
  if (!meds) return []
  return meds
    .filter(
      (med) =>
        med.rule.type === "mesna" &&
        med.days.includes(day - 1) &&
        !med.days.includes(day) &&
        (med.donorType == null || med.donorType === donorType),
    )
    .map((med) => med.id)
}

export function getOrderDaysForRegimen(regimenId: string | null): number[] {
  const meds = regimenId ? medsForRegimen(regimenId) : null
  if (!meds) return CONDITIONING_DAYS
  const set = new Set<number>()
  meds.forEach((m) => m.days.forEach((d) => set.add(d)))
  const days = [...set].sort((a, b) => a - b)
  if (regimenId === "bucyeto") return days.filter((day) => day <= 0)
  if (regimenId === "bumel") {
    return days.filter((day) => day !== 2 && day !== 3 && day !== 7)
  }
  if (regimenId === "buflubatg") return days.filter((day) => day !== 4)
  if (regimenId === "buflu-ptcy") return days.filter((day) => day !== 1 && day !== 2)
  if (regimenId === "tbi-cy") return days.filter((day) => TBI_CY_ORDER_DAYS.includes(day))
  return days
}

export interface OrderMedWithMeta extends OrderMed {
  note?: string
  sup?: boolean
  tit?: boolean
  /** 향정신성의약품 뱃지 */
  controlled?: boolean
  /** PRN 뱃지 */
  prnBadge?: boolean
  /** 묶음 오더의 용매 줄 */
  solvent?: string
  /** 용매가 아닌 추가 약품 묶음 줄 */
  bundleItems?: OrderBundleItem[]
  /** 수행시간 옆 부가 표기 */
  timeNote?: string
  /** 첫 수행시간 뒤 부가 표기 */
  firstTimeNote?: string
  /** 계산형 hydration의 날짜별 교환 phase 기준일 */
  hydrationStartDay?: number
  suffixEachTime?: boolean
  /** (단독) 표기 */
  solo?: boolean
  /** 첫 투약 → +1 오더 행 생성 (경구약 또는 firstDoseExtra) */
  firstDose?: boolean
  /** 경구약 마지막 투약 → 조제유보 아이콘 */
  lastOralDose?: boolean
  holdMainOrder?: boolean
  holdFirstDose?: boolean
  noHoldFirstDose?: boolean
  /** +1 행에도 작은 용법·용량 줄을 반복 표시 */
  repeatDetailOnFirstDose?: boolean
  /** +1 행 전용 용법·용량 */
  firstDoseDetail?: string
}

/** 수동 시간 선택값. key는 `${day}:${medId}` */
export type OrderTimeOverrides = Record<string, string[]>

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

function isActualChemo(med: MedDef): boolean {
  return med.rule.type === "chemo" || (med.rule.type === "select" && med.rule.isChemo === true)
}

/** 실제 첫 항암제 투약일. TBI/MTX 같은 비항암 시술·선택 행은 제외한다. */
export function getFirstChemoDay(regimenId: string | null): number | null {
  if (!regimenId) return null
  const meds = REGIMEN_MEDS[regimenId] ?? []
  const chemoDays = meds
    .filter(isActualChemo)
    .flatMap((m) => m.days)
  return chemoDays.length > 0 ? Math.min(...chemoDays) : null
}

/** 동의서/당기기 패널 노출 여부에 사용하는 실제 항암 투약일 판정 */
export function hasChemoForDay(regimenId: string | null, day: number): boolean {
  if (!regimenId) return false
  return (REGIMEN_MEDS[regimenId] ?? []).some(
    (m) => m.days.includes(day) && isActualChemo(m),
  )
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
  const firstDay = getFirstChemoDay(regimenId)
  if (!regimenId || firstDay == null || day <= firstDay) return cursor

  const chemoDays = [
    ...new Set(
      (REGIMEN_MEDS[regimenId] ?? [])
        .filter(isActualChemo)
        .flatMap((m) => m.days),
    ),
  ].sort((a, b) => a - b)

  // days는 기존 공개 API 호환 및 호출부의 표시 순서를 보존하기 위해 유지한다.
  void days
  for (const d of chemoDays) {
    if (d > day) break
    if (d === firstDay) continue
    if (isPullForward(settings, d)) cursor -= getPullLimitMin(regimenId, d)
  }
  // 첫 항암 투약일은 선택한 시간 그대로, 이후 날짜는 최소 11:00
  return Math.max(11 * 60, cursor)
}

function overrideMinute(
  overrides: OrderTimeOverrides,
  day: number,
  medId: string,
): number | undefined {
  const value = overrides[`${day}:${medId}`]?.[0]
  return value ? toMinutes(value) : undefined
}

function scheduleChemo(
  meds: MedDef[],
  startMin: number,
  day: number,
  overrides: OrderTimeOverrides,
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
    at[m.id] = overrideMinute(overrides, day, m.id) ?? cursor
    cursor = at[m.id]! + rule.durationMin // 연속 투약 (동시 투약 방지)
  }

  // 선택 시술과 고정 오더도 relative rule에서 참조할 수 있도록 anchor로 등록한다.
  for (const m of meds) {
    const override = overrideMinute(overrides, day, m.id)
    if (m.rule.type === "select" || m.rule.type === "procedure") {
      at[m.id] = override ?? toMinutes(m.rule.defaultTime)
    } else if (m.rule.type === "fixed" && m.rule.times[0]) {
      at[m.id] = override ?? toMinutes(m.rule.times[0])
    }
  }

  const selectedChemo = meds.find(
    (m) => m.rule.type === "select" && m.rule.isChemo === true,
  )
  const firstStart = chemo.length > 0
    ? at[chemo[0]!.id]!
    : selectedChemo
      ? at[selectedChemo.id]!
      : startMin
  return { at, firstStart }
}

function resolveTimes(
  med: MedDef,
  anchors: Record<string, number>,
  firstChemo: number,
  settings: ScheduleSettings,
  day: number,
  firstChemoDay: number | null,
  days: number[],
  timelineSettings: ScheduleSettings,
): string[] {
  const rule = med.rule
  switch (rule.type) {
    case "chemo":
      if (med.splitInfusion) {
        const start = anchors[med.id] ?? firstChemo
        return Array.from({ length: med.splitInfusion.count }, (_, i) =>
          fromMinutes(start + i * med.splitInfusion!.intervalMin),
        )
      }
      return [fromMinutes(anchors[med.id] ?? firstChemo)]
    case "select":
    case "procedure":
      return [fromMinutes(anchors[med.id] ?? toMinutes(rule.defaultTime))]
    case "antiemetic-iv":
      return [fromMinutes(firstChemo - 30)]
    case "pre-chemo":
      return [fromMinutes(firstChemo + rule.offsetMin)]
    case "relative": {
      const base = anchors[rule.ref]
      if (base == null) return []
      // Busulfan이 12:00에 시작하는 날은 Keppra 로딩 총 1.5g
      // (1g + 500mg 개별 오더)을 모두 08:00에 투약한다.
      if (med.id.includes("levetiracetam-loading") && fromMinutes(base) === "12:00") {
        return ["08:00"]
      }
      const count = rule.count ?? 1
      const step = rule.repeatEveryMin ?? 0
      return Array.from({ length: count }, (_, i) => {
        const rawAbsolute = base + rule.offsetMin + i * step
        const absolute = rule.roundDownToHour
          ? Math.floor(rawAbsolute / 60) * 60
          : rawAbsolute
        const dayMarker = absolute >= DAY_MINUTES ? "(익일)" : absolute < 0 ? "(전일)" : ""
        return `${fromMinutes(absolute)}${dayMarker}`
      })
    }
    case "mesna": {
      const base = anchors[rule.ref]
      if (base == null) return []
      return getMesnaTimes(base)
    }
    case "ekg-monitoring": {
      const firstDay = Math.min(...med.days)
      if (day === firstDay) {
        const start = fromMinutes(anchors[rule.ref] ?? firstChemo)
        return start === "21:00" ? [start] : [start, "21:00"]
      }
      return ["05:00", "13:00", "21:00"]
    }
    case "fixed":
      return rule.times
    case "oral": {
      const isFirstChemoDay = day === firstChemoDay
      const isAfterFirstChemoDay = firstChemoDay != null && day > firstChemoDay
      const firstMedicationDay = Math.min(...med.days)
      const isAfterFirstMedicationDay = day > firstMedicationDay
      const initialChemoStart = getChemoStartTime(settings)
      const keepLateSchedule = initialChemoStart === "16:30" || initialChemoStart === "17:30"
      const useRegularSchedule = isAfterFirstChemoDay && !keepLateSchedule
      const isLateBidProphylaxis =
        keepLateSchedule &&
        (med.id.startsWith("citopcin") || med.id.startsWith("acyclovir"))

      if (rule.freq === "bid") {
        if (isLateBidProphylaxis && isFirstChemoDay) return ["20:00"]
        if (isLateBidProphylaxis && isAfterFirstChemoDay) return ["08:00", "20:00"]
        if (useRegularSchedule) return ["08:00", "20:00"]
        return getBidOralTimes(settings)
      }

      if (rule.freq === "tid") {
        // UDCA는 첫 투약일에만 늦은 시작시간(18:00/22:00 등)을 따르고,
        // 그 다음 투약일부터는 항상 일반 TID 시간으로 복귀한다.
        if (med.id.startsWith("ursa") && isAfterFirstMedicationDay) {
          return ["08:00", "12:00", "18:00"]
        }
        if (useRegularSchedule) return ["08:00", "12:00", "18:00"]
        return getTidOralTimes(settings)
      }

      if (useRegularSchedule) return [rule.base ?? "08:00"]
      return [getQdOralTime(settings, rule.base)]
    }
    case "mycamine":
      if (med.id === "mycamine-batg" && day > Math.min(...med.days)) {
        return ["16:00"]
      }
      return [getMycamineTime(settings)]
    case "hydration":
      return getHydrationTimes(rule.rateCcHr)
    case "melphalan-hydration":
      return getMelphalanHydrationTimes(
        rule.regimenId ?? "hdmel",
        rule.melphalanDays ?? HDMEL_MELPHALAN_DAYS,
        day,
        timelineSettings,
        days,
        {
          activeStartDay: rule.activeStartDay,
          activeEndDay: rule.activeEndDay,
          reviewDay: rule.reviewDay,
        },
      )
    case "prn":
      return ["PRN"]
  }
}

function displayKind(med: MedDef): OrderMed["scheduleKind"] {
  switch (med.rule.type) {
    case "select":
    case "procedure":
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
  timelineSettings: ScheduleSettings = settings,
  timeOverrides: OrderTimeOverrides = {},
): OrderMedWithMeta[] {
  if (!regimenId) return []
  const all = medsForRegimen(regimenId)
  if (!all) return []

  const dayList = days && days.length > 0 ? days : getOrderDaysForRegimen(regimenId)
  const firstChemoDay = getFirstChemoDay(regimenId)
  const todays = all.filter(
    (m) =>
      m.days.includes(day) &&
      (m.donorType == null || m.donorType === settings.donorType),
  )
  const rawStart = getChemoStartMinutesForDay(regimenId, day, dayList, settings)
  // mesna / M-pred / dexamethasone <Mix> 오더가 있는 날은 그 오더를 11:00 에 두고
  // 항암제를 11:30 이후로 밀어낸다
  const hasMixPriority = todays.some(
    (m) => /^(mesna|mpred|dexamethasone)/.test(m.id) && (m.solvent ?? "").includes("<Mix>"),
  )
  const startMin = hasMixPriority ? Math.max(rawStart, 11 * 60 + 30) : rawStart
  const { at: anchors, firstStart } = scheduleChemo(
    todays,
    startMin,
    day,
    timeOverrides,
  )

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
        suffixEachTime: m.suffixEachTime,
        note: m.note,
        sup: m.sup,
        tit: m.tit,
        controlled: m.controlled,
        prnBadge: m.prnBadge,
        solvent: m.solvent,
        bundleItems: m.bundleItems,
        timeNote: m.timeNote,
        firstTimeNote:
          m.id === "tbi"
            ? `TBI#${sortedDays.indexOf(day) + 1}/${sortedDays.length}`
            : m.firstTimeNote ??
              (m.rule.type === "ekg-monitoring" && day === sortedDays[0]
                ? "start"
                : undefined),
        hydrationStartDay:
          m.rule.type === "hydration" ? sortedDays[0] : undefined,
        solo: m.rule.type === "antiemetic-iv",
        repeatDetailOnFirstDose: m.repeatDetailOnFirstDose,
        firstDoseDetail: m.firstDoseDetail,
        holdMainOrder: m.holdMainOrder,
        holdFirstDose: m.holdFirstDose,
        // 늦은 첫 투약에서 UDCA +1 오더에는 조제유보를 표시하지 않는다.
        noHoldFirstDose: m.noHoldFirstDose || m.id.startsWith("ursa"),
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
        endMark:
          (m.rule.type === "ekg-monitoring" &&
            day === sortedDays[sortedDays.length - 1]) ||
          (m.noHoldLast === true &&
            m.noEndMark !== true &&
            day === sortedDays[sortedDays.length - 1]),
        scheduleKind: displayKind(m),
        defaultTimes: resolveTimes(
          m,
          anchors,
          firstStart,
          settings,
          day,
          firstChemoDay,
          dayList,
          timelineSettings,
        ),
        timeOptions:
          m.rule.type === "select" || m.rule.type === "procedure"
            ? m.rule.options
            : undefined,
      }
    })
}
