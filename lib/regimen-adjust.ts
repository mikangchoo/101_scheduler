// lib/regimen-adjust.ts
import type { CalcResult } from "@/lib/calc"
import { round } from "@/lib/calc"
import type { RenderLine, Segment } from "@/lib/regimen-render"
import { isAutoRegimen } from "@/lib/regimens"

/**
 * 레지멘 확인창 표시 규칙 (체크박스 위치 / 계산값 / 우측 주석)을
 * 렌더 직전에 일괄 적용하는 후처리 계층.
 */
export interface AdjustedLine extends RenderLine {
  /** 문장 끝(인라인)에 체크박스 표시 */
  checkboxRight?: boolean
  /** 문장 끝 체크박스 전용 id (좌측 체크박스와 독립 토글) */
  idRight?: string
  /** 인쇄 시 숨김 (화면에만 표시) */
  printHidden?: boolean
}

function n(v: number, decimals = 0): string {
  return round(v, decimals).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function textOf(line: RenderLine): string {
  if (line.segments) return line.segments.map((s) => s.text).join("")
  return line.text ?? ""
}

/** 세그먼트 배열로 정규화 (문장 끝에 계산값을 덧붙이기 위함) */
function toSegments(line: RenderLine): Segment[] {
  if (line.segments) return [...line.segments]
  return [{ text: line.text ?? "" }]
}

function appendRed(line: AdjustedLine, redText: string): AdjustedLine {
  const segments = [...toSegments(line), { text: redText, red: true }]
  const { text: _drop, ...rest } = line
  return { ...rest, segments }
}

/* ---------------- 규칙 정의 ---------------- */

/** 체크박스 삭제 대상 */
const REMOVE_CHECKBOX = [
  "G-CSF 600ug",
  "B. 나머지 경우: IVIg",
  "MMF는 D+30~35",
  "Adm batt",
  // ThioBuCy: letermovir 병기 라인은 체크박스 없음 (아래 IVIg 급여 라인에만 부여)
  "CMV prophylaxis: letermovir",
  // CMV prophylaxis C. 고위험군(ganciclovir) 라인은 체크박스 없음
  "C. 고위험군",
]

/** 문장 끝(인라인)에 체크박스 */
const RIGHT_CHECKBOX = ["H2 blocker or PPI"]

/** 좌측 체크박스를 반드시 표시할 라인 */
const FORCE_CHECKBOX = [
  "G-CSF 300ug/m²",
  "(250cc/hr: from -6 hr to +12hr",
  "1.5L/day D+5 – D+7",
  "Premed (-30 min): Chlorpheniramine",
  "Vit K 10mg iv weekly",
]

/** auto 레지멘에서만 좌측 체크박스를 부여할 IVIg 급여 라인 */
const AUTO_IVIG_LINE = "IVIg 500mg/kg iv (D"

/** ThioBuCy 등 auto 레지멘에 IVIg 급여 라인이 없을 때 삽입할 문구 */
const AUTO_IVIG_TEXT =
  "IVIg 500mg/kg iv (D7부터 2주 간격, 3개월까지 격주 500mg/kg, 이후 6개월까지 매월 500mg/kg, 최장 9개월 급여)"

/** Filter 필요 약제 */
const FILTER_LINES = ["Thiotepa ", "ATG (Rabbit"]

/** 환자 요약 라인 (인쇄 시에는 상단 우측 박스로만 표기) */
const PATIENT_SUMMARY_PREFIX = ["Actual Bwt", "ABW25", "BSA:"]

function includesAny(text: string, list: string[]): boolean {
  return list.some((k) => text.includes(k))
}

/* ---------------- Antiemetics 블록 판정 ---------------- */

/** 약제 표기 [D] 등을 제거한 뒤 day count 토큰(D-8, D+5, D0, D-7~D-6 …) 존재 여부 */
function hasDayCount(text: string): boolean {
  const stripped = text.replace(/\[[^\]]*\]/g, " ")
  return /(?:^|[\s(,~\-–/])D\s*[-+–~]?\s*\d/.test(stripped)
}

/** PRN / 주석 / 대안 줄 접두어 → 체크박스 대상 아님 */
function isNonOrderLine(trimmed: string): boolean {
  return /^(prn|\*|※|#|-|–|\(|or\b|OR\b)/i.test(trimmed)
}

/** 줄 맨 앞이 or/OR 로 시작 → 대안 요법 시작 */
function isAlternativeLine(trimmed: string): boolean {
  return /^or\b/i.test(trimmed)
}

/**
 * - blockIndexes: Antiemetics 제목 + 그 이하 줄 전체
 * - checkboxIndexes: 좌측 체크박스를 부여할 줄
 *   (제목 제외 / 첫 "or ..." 줄 이전 / day count 있음 / PRN·주석 아님)
 */
function antiemeticIndexes(lines: RenderLine[]): {
  blockIndexes: Set<number>
  checkboxIndexes: Set<number>
} {
  const blockIndexes = new Set<number>()
  const checkboxIndexes = new Set<number>()

  let inside = false
  let alternativeStarted = false

  lines.forEach((line, i) => {
    const kind = line.kind ?? "normal"
    const text = textOf(line)

    if (/Antiemetics/i.test(text)) {
      inside = true
      alternativeStarted = false
      blockIndexes.add(i)
      return // 제목 줄에는 체크박스 없음
    }

    if (!inside) return

    if (kind === "section" || kind === "title") {
      inside = false
      alternativeStarted = false
      return
    }

    blockIndexes.add(i)

    const trimmed = text.trim()
    if (trimmed.length === 0) return

    if (isAlternativeLine(trimmed)) {
      alternativeStarted = true
      return
    }
    if (alternativeStarted) return
    if (isNonOrderLine(trimmed)) return
    if (!hasDayCount(trimmed)) return

    checkboxIndexes.add(i)
  })

  return { blockIndexes, checkboxIndexes }
}

/**
 * auto 레지멘에서 IVIg 급여 라인이 없으면 letermovir/CMV prophylaxis 라인 뒤에 삽입.
 */
function ensureAutoIvigLine(lines: RenderLine[], regimenId: string | null): RenderLine[] {
  if (!isAutoRegimen(regimenId)) return lines
  if (lines.some((l) => textOf(l).includes(AUTO_IVIG_LINE))) return lines

  const anchor = lines.findIndex((l) => /CMV prophylaxis/i.test(textOf(l)))
  if (anchor < 0) return lines

  const base = lines[anchor]
  const inserted: RenderLine = {
    text: AUTO_IVIG_TEXT,
    kind: "normal",
    indent: base.indent ?? 0,
  }
  return [...lines.slice(0, anchor + 1), inserted, ...lines.slice(anchor + 1)]
}

export interface AdjustOptions {
  regimenId: string | null
  calc: CalcResult
}

export function adjustRegimenLines(rawLines: RenderLine[], opts: AdjustOptions): AdjustedLine[] {
  const { regimenId, calc } = opts
  const isPtCy = regimenId === "buflu-ptcy"
  const isAuto = isAutoRegimen(regimenId)
  const gcsfStart = isPtCy ? "D5~" : "D1~"

  const lines = ensureAutoIvigLine(rawLines, regimenId)
  const { blockIndexes: antiemetics, checkboxIndexes: antiemeticCheckbox } =
    antiemeticIndexes(lines)

  return lines.map((raw, i) => {
    let line: AdjustedLine = { ...raw }
    const text = textOf(line)

    /* 1. 환자 요약: 인쇄 시 숨김 */
    if (PATIENT_SUMMARY_PREFIX.some((p) => text.startsWith(p))) {
      line.printHidden = true
      line.checkbox = false
      return line
    }

    /* 2. 체크박스 삭제 (요청 목록) */
    if (includesAny(text, REMOVE_CHECKBOX)) {
      line.checkbox = false
    }

    /* 2-1. Antiemetics 블록: day count 있는 처방 줄 & or 이전만 체크박스 */
    if (antiemetics.has(i)) {
      if (antiemeticCheckbox.has(i)) {
        line.checkbox = true
        line.id = line.id ?? `antiemetic-cb-${i}`
      } else {
        line.checkbox = false
      }
    }

    /* 3. 좌측 체크박스 강제 표시 */
    if (includesAny(text, FORCE_CHECKBOX)) {
      line.checkbox = true
      line.id = line.id ?? `force-cb-${i}`
    }

    /* 3-1. IVIg 급여 라인: auto 레지멘에서만 좌측 체크박스 */
    if (text.includes(AUTO_IVIG_LINE) && !text.includes("B. 나머지 경우")) {
      line.checkbox = isAuto
      if (isAuto) line.id = line.id ?? `ivig-cb-${i}`
    }

    /* 4. 문장 끝 인라인 체크박스 (좌측 체크박스와 공존) */
    if (includesAny(text, RIGHT_CHECKBOX)) {
      line.checkboxRight = true
      line.idRight = line.idRight ?? `right-cb-${i}`
    }

    /* 5. Thiotepa / ATG → Filter (빨간 글씨, 우측 정렬) */
    if (includesAny(text, FILTER_LINES)) {
      line.annotation = "Filter"
    }

    /* 6. Cyclophosphamide: 60mg/kg 이상일 때만 얼음/EKG */
    if (text.trimStart().startsWith("Cyclophosphamide") && line.annotation?.includes("얼음")) {
      const m = text.match(/\(\s*([\d.]+)\s*mg\/kg\)/)
      const perKg = m ? Number.parseFloat(m[1]) : Number.NaN
      if (!Number.isFinite(perKg) || perKg < 60) line.annotation = undefined
    }

    /* 7. G-CSF: 계산값 삭제 + 시작일 빨간 글씨 */
    if (/G-CSF/.test(text) && !text.includes("600ug")) {
      line.annotation = undefined
      line = appendRed(line, `  ${gcsfStart}`)
    }

    /* 8-1. CsA / Tacrolimus 계산값 */
    if (text.includes("Cyclosporin A (related) 3mg/kg civ")) {
      line = appendRed(
        line,
        `  → CsA ${n(3 * calc.tbw, 1)} mg / Tacrolimus ${n(0.04 * calc.tbw, 2)} mg`,
      )
    }

    /* 8-2. 1.5L/day D+5 – D+7 → cc/hr 우측 정렬 */
    if (text.includes("1.5L/day D+5 – D+7")) {
      line.annotation = `${n(1500 / 24, 1)} cc/hr`
    }

    /* 8-3. ATG 1.5 / 2.5 mg/kg/day 계산값 */
    const atgMatch = text.match(/^\s*(1\.5|2\.5) mg\/kg\/day for/)
    if (atgMatch) {
      const perKg = Number.parseFloat(atgMatch[1])
      line = appendRed(line, `  = ${n(perKg * calc.tbw, 1)} mg`)
    }

    return line
  })
}
