"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Printer } from "lucide-react"
import { StepHeader } from "@/components/step-header"
import { useFlow } from "@/contexts/flow-context"
import { findRegimen } from "@/lib/regimens"
import { computeCalc, isValidPatient } from "@/lib/calc"
import { buildRegimenLines, type Segment } from "@/lib/regimen-render"
import { adjustRegimenLines, type AdjustedLine } from "@/lib/regimen-adjust"
import type { DoseKey } from "@/lib/dose-overrides"
import { cn } from "@/lib/utils"

/** 소수 둘째 자리까지 표기, 둘째 자리가 0이면 첫째 자리까지만 표기 */
function formatPatientNumber(value: number): string {
  if (!Number.isFinite(value)) return "-"
  const rounded = Math.round(value * 100) / 100
  const two = rounded.toFixed(2)
  if (two.endsWith("0")) return rounded.toFixed(1)
  return two
}

export default function RegimenConfirmPage() {
  const router = useRouter()
  const { regimenId, patient, doseOverrides, setDoseOverrides } = useFlow()
  const regimen = findRegimen(regimenId)
  const [hydrated, setHydrated] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  useEffect(() => setHydrated(true), [])

  useEffect(() => {
    if (!hydrated) return
    if (!regimen?.available) router.replace("/")
    else if (!isValidPatient(patient)) router.replace("/patient")
  }, [hydrated, regimen, patient, router])

  const lines = useMemo<AdjustedLine[]>(() => {
    if (!isValidPatient(patient) || !regimenId) return []
    const calc = computeCalc(patient)
    return adjustRegimenLines(buildRegimenLines(regimenId, calc, doseOverrides), {
      regimenId,
      calc,
    })
  }, [patient, regimenId, doseOverrides])

  if (!hydrated || !regimen?.available || !isValidPatient(patient)) return null

  const title = lines.find((l) => l.kind === "title")?.text ?? regimen.label

  function updateDose(key: DoseKey, value: number) {
    setDoseOverrides((prev) => ({ ...prev, [key]: value }))
  }

  function toggle(id: string) {
    setChecked((c) => ({ ...c, [id]: !c[id] }))
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="no-print">
        <StepHeader current={3} />
      </div>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-balance text-xl font-semibold text-foreground">레지멘 확인</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {patient.name ? `${patient.name} · ` : ""}
              {regimen.label} · 빨간 값은 자동 계산치입니다. 용량 텍스트를 더블클릭하면 수정할 수 있습니다.
            </p>
          </div>
        </div>

        {/* Printable regimen document */}
        <article className="print-area overflow-hidden rounded-xl border border-ocs-border bg-ocs-panel shadow-lg">
          {/* Print-only header: 가운데 굵은 제목 + 제목 아래 우측 정렬 3줄 텍스트 (박스 없음) */}
          <div className="print-only px-8 pt-6">
            <h1 className="text-center text-lg font-bold text-ocs-header">{title}</h1>
            {/* 제목과 환자정보 사이: 한 줄 */}
            <div className="h-[1em]" aria-hidden="true" />
            <PatientHeaderLines patient={patient} showAbw={regimen.hasBusulfan} />
            {/* 환자정보와 본문 사이: 두 줄 */}
            <div className="h-[2em]" aria-hidden="true" />
          </div>

          <div className="regimen-scroll max-h-[62vh] overflow-y-auto px-6 py-6 sm:px-8">
            {lines.map((line, i) => (
              <RegimenLineRow
                key={i}
                line={line}
                checked={line.id ? !!checked[line.id] : false}
                checkedRight={line.idRight ? !!checked[line.idRight] : false}
                onToggle={line.id ? () => toggle(line.id!) : undefined}
                onToggleRight={line.idRight ? () => toggle(line.idRight!) : undefined}
                onDoseChange={updateDose}
              />
            ))}
          </div>
        </article>

        {/* Nav */}
        <div className="no-print mt-8 flex items-center justify-between">
          <button
            onClick={() => router.push("/patient")}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            이전
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <Printer className="h-4 w-4" />
              출력
            </button>
            <button
              onClick={() => router.push("/order")}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              다음
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

/** 제목 아래, 우측 정렬 3줄 (박스/보더 없음). ABW25는 showAbw가 true일 때만 표시 */
function PatientHeaderLines({
  patient,
  showAbw,
}: {
  patient: { name: string; sex: "male" | "female"; heightCm: number; weightKg: number }
  showAbw?: boolean
}) {
  const calc = computeCalc(patient)
  return (
    <div className="text-right text-sm leading-snug text-ocs-text">
      <div>Actual BWT {formatPatientNumber(calc.tbw)} kg</div>
      {showAbw && <div>ABW 25 {formatPatientNumber(calc.abw25)} kg</div>}
      <div>BSA {formatPatientNumber(calc.bsa)} m²</div>
    </div>
  )
}

function RegimenLineRow({
  line,
  checked,
  checkedRight,
  onToggle,
  onToggleRight,
  onDoseChange,
}: {
  line: AdjustedLine
  checked: boolean
  checkedRight: boolean
  onToggle?: () => void
  onToggleRight?: () => void
  onDoseChange: (key: DoseKey, value: number) => void
}) {
  const {
    text,
    segments,
    annotation,
    kind = "normal",
    indent = 0,
    checkbox,
    checkboxRight,
    printHidden,
  } = line

  if (kind === "spacer") return <div className="h-3" aria-hidden="true" />

  const indentClass = indent === 2 ? "pl-8" : indent === 1 ? "pl-4" : ""

  return (
    <div
      className={cn(
        "flex items-start gap-2 py-0.5 break-inside-avoid",
        (kind === "title" || printHidden) && "print:hidden",
      )}
    >
      {/* 체크박스 열: 항상 좌측 맨 앞 고정 정렬 (들여쓰기와 무관) */}
      <span className="mt-[3px] flex w-4 shrink-0 justify-start">
        {checkbox && <CheckBox checked={checked} onToggle={onToggle} />}
      </span>

      {/* 본문: 체크박스와 항상 같은 줄에서 시작 */}
      <p
        className={cn(
          "not-italic flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1 leading-relaxed text-ocs-text",
          indentClass,
          kind === "title" && "mb-1 text-base font-bold text-ocs-header",
          kind === "section" && "mt-1 text-sm text-ocs-highlight",
          kind === "sub" && "text-sm font-semibold",
          kind === "normal" && "text-sm",
        )}
      >
        {segments ? (
          segments.map((seg, i) => <SegmentView key={i} seg={seg} onDoseChange={onDoseChange} />)
        ) : (
          <span>{text}</span>
        )}
        {/* 문장 끝 인라인 체크박스 (예: H2 blocker or PPI) */}
        {checkboxRight && (
          <CheckBox checked={checkedRight} onToggle={onToggleRight} className="ml-1" />
        )}
      </p>

      {annotation && (
        <span className="max-w-[40%] shrink break-words whitespace-normal text-right font-mono text-sm font-semibold leading-snug text-red-500 sm:max-w-none sm:shrink-0 sm:whitespace-nowrap print:max-w-none print:shrink-0 print:whitespace-nowrap">
          {annotation}
        </span>
      )}
    </div>
  )
}

function CheckBox({
  checked,
  onToggle,
  className,
}: {
  checked: boolean
  onToggle?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label="오더 체크박스"
      className={cn(
        "not-italic inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border border-ocs-muted text-[10px] font-bold leading-none",
        checked ? "bg-ocs-highlight text-white" : "bg-transparent text-transparent",
        className,
      )}
    >
      ✓
    </button>
  )
}

function SegmentView({
  seg,
  onDoseChange,
}: {
  seg: Segment
  onDoseChange: (key: DoseKey, value: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (seg.dose) {
    const { key, unit } = seg.dose
    if (editing) {
      const commit = () => {
        const v = Number.parseFloat(draft)
        if (!Number.isNaN(v) && v > 0) onDoseChange(key, v)
        setEditing(false)
      }
      return (
        <span className="not-italic inline-flex items-baseline">
          <input
            ref={inputRef}
            type="number"
            step="any"
            defaultValue={seg.text}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === "Enter") commit()
              if (e.key === "Escape") setEditing(false)
            }}
            className="w-16 rounded border border-ocs-highlight bg-ocs-panel px-1 py-0 font-mono text-sm text-ocs-text outline-none"
            aria-label="용량 수정"
          />
          <span className="text-ocs-muted">{unit}</span>
        </span>
      )
    }
    return (
      <button
        type="button"
        onDoubleClick={() => {
          setDraft(seg.text)
          setEditing(true)
        }}
        title="더블클릭하여 용량 수정"
        className="not-italic rounded px-0.5 font-medium text-ocs-highlight underline decoration-dotted underline-offset-2 hover:bg-ocs-highlight/20"
      >
        {seg.text}
        {unit}
      </button>
    )
  }

  return <span className={cn(seg.red && "font-semibold text-red-500")}>{seg.text}</span>
}
