"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react"
import { StepHeader } from "@/components/step-header"
import { Badge, OrderMedRow } from "@/components/order-med-row"
import { useFlow } from "@/contexts/flow-context"
import { findRegimen } from "@/lib/regimens"
import { computeCalc, isValidPatient } from "@/lib/calc"
import { formatDay, getOrderDaysForRegimen } from "@/lib/order-schedule"
import { buildOrderWindow, effectiveSettings, PRN_ORDERS } from "@/lib/order-window"
import { describeStart, type NoConsentStart } from "@/lib/schedule-settings"
import type { RenderLine } from "@/lib/regimen-render"
import { cn } from "@/lib/utils"

/** times state keyed by `${day}:${medId}` */
type TimesState = Record<string, string[]>

export default function OrderPage() {
  const router = useRouter()
  const { regimenId, patient, doseOverrides, scheduleSettings, setScheduleSettings } = useFlow()
  const regimen = findRegimen(regimenId)
  const [hydrated, setHydrated] = useState(false)
  const [times, setTimes] = useState<TimesState>({})

  const days = useMemo(() => getOrderDaysForRegimen(regimenId), [regimenId])
  const [day, setDay] = useState<number>(days[0] ?? -3)

  useEffect(() => setHydrated(true), [])

  useEffect(() => {
    if (!days.includes(day)) setDay(days[0] ?? -3)
  }, [days, day])

  useEffect(() => {
    if (!hydrated) return
    if (!regimen) router.replace("/")
    else if (!isValidPatient(patient)) router.replace("/patient")
  }, [hydrated, regimen, patient, router])

  const window_ = useMemo(() => {
    if (!isValidPatient(patient) || !regimenId) return null
    return buildOrderWindow({
      regimenId,
      day,
      days,
      calc: computeCalc(patient),
      doseOverrides,
      settings: scheduleSettings,
    })
  }, [regimenId, patient, doseOverrides, day, days, scheduleSettings])

  // 동의서 설정이 변하면 계산값을 다시 쓰도록 수동 편집분 초기화
  useEffect(() => {
    setTimes({})
  }, [scheduleSettings.consentReceived, scheduleSettings.noConsentStart])

  function timesFor(medId: string, fallback: string[]): string[] {
    return times[`${day}:${medId}`] ?? fallback
  }

  function setTimesFor(medId: string, next: string[]) {
    setTimes((prev) => ({ ...prev, [`${day}:${medId}`]: next }))
  }

  if (!hydrated || !regimen || !isValidPatient(patient) || !window_) return null

  const firstDay = days[0] ?? day
  const isFirstDay = window_.isFirstDay
  const applied = effectiveSettings(scheduleSettings, day, firstDay)

  return (
    <main className="min-h-dvh bg-background">
      <StepHeader current={4} />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h2 className="text-balance text-xl font-semibold text-foreground">오더 스케줄</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            레지멘 전문은 기울임체로 표시되고, 실제 처방되는 오더만 정자로 수행시간과 함께 표시됩니다.
          </p>
        </div>

        {/* 동의서 여부 — 첫 항암 투약일에만 적용 */}
        <section className="mb-6 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">동의서가 있습니까?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            첫 항암 투약일({formatDay(firstDay)})에만 적용되며, 이후 날짜 스케줄에는 영향을 주지 않습니다.
          </p>
          {isFirstDay ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ConsentButton
                  active={scheduleSettings.consentReceived === true}
                  onClick={() => setScheduleSettings((s) => ({ ...s, consentReceived: true }))}
                  label="예 (11:00 시작)"
                />
                <ConsentButton
                  active={scheduleSettings.consentReceived === false}
                  onClick={() => setScheduleSettings((s) => ({ ...s, consentReceived: false }))}
                  label="아니오"
                />

                {scheduleSettings.consentReceived === false && (
                  <div className="relative">
                    <select
                      value={scheduleSettings.noConsentStart}
                      onChange={(e) =>
                        setScheduleSettings((s) => ({
                          ...s,
                          noConsentStart: e.target.value as NoConsentStart,
                        }))
                      }
                      className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-9 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
                      aria-label="항암 시작 시간 선택"
                    >
                      <option value="13:00">1:00 P.M.</option>
                      <option value="16:30">4:30 P.M.</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{describeStart(scheduleSettings)}</p>
            </>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {formatDay(day)} 는 기본 스케줄로 계산됩니다 · {describeStart(applied)}
            </p>
          )}
        </section>

        {/* Day selector */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-xs font-semibold transition-colors",
                d === day
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {formatDay(d)}
            </button>
          ))}
        </div>

        {/* OCS-style order window: 레지멘 전문 + 실제 오더 */}
        <div className="overflow-hidden rounded-xl border border-ocs-border shadow-lg">
          <div className="grid grid-cols-[1fr_auto] bg-ocs-header px-3 py-2 text-[13px] font-semibold text-white">
            <span>
              약품처방 — {regimen.label} / {formatDay(day)}
            </span>
            <span className="text-right">수행시간</span>
          </div>

          <div className="max-h-[62vh] overflow-y-auto bg-ocs-panel">
            {window_.rows.map((row, i) =>
              row.kind === "regimen" ? (
                <RegimenTextRow key={row.key} line={row.line} />
              ) : (
                <OrderMedRow
                  key={row.key}
                  med={row.med}
                  times={timesFor(row.med.id, row.med.defaultTimes)}
                  onChange={(t) => setTimesFor(row.med.id, t)}
                  alt={i % 2 === 1}
                />
              ),
            )}
          </div>

          {/* PRN order — 모든 일자 공통 */}
          <div className="grid grid-cols-[1fr_auto] border-t border-ocs-border bg-ocs-header px-3 py-2 text-[13px] font-semibold text-white">
            <span>PRN order</span>
            <span className="text-right">수행시간</span>
          </div>
          {PRN_ORDERS.map((o, i) => (
            <div
              key={o.id}
              className={cn(
                "grid grid-cols-[1fr_auto] items-start gap-4 border-b border-ocs-border px-3 py-1.5",
                i % 2 === 1 ? "bg-ocs-row-alt" : "bg-ocs-row",
              )}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ocs-text">
                  <Badge kind={o.badge} />
                  <span className="truncate">{o.name}</span>
                </p>
                <p className="truncate text-[11px] text-ocs-muted">{o.detail}</p>
              </div>
              <span className="whitespace-nowrap font-mono text-[13px] text-ocs-muted">PRN/</span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-ocs-muted">
          항암제는 정주시간이 짧은 약제부터 순차 배치되어 동시 투약이 발생하지 않습니다. Citopcin / Ursa 는 첫 시간을
          더블클릭하여 편집, Thiotepa 는 목록에서 수행시간을 선택합니다.
        </p>

        {/* Nav */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => router.push("/regimen")}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            이전
          </button>
          <button
            onClick={() => router.push("/done")}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            다음
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </main>
  )
}

/** 레지멘 전문 — 전부 기울임체 (실제 오더가 아님) */
function RegimenTextRow({ line }: { line: RenderLine }) {
  const kind = line.kind ?? "normal"
  if (kind === "spacer") return <div className="h-2" aria-hidden="true" />

  const text = line.segments ? line.segments.map((s) => s.text).join("") : (line.text ?? "")
  const indent = line.indent ?? 0

  return (
    <div className="flex items-start gap-3 px-3 py-[1px]">
      <p
        className={cn(
          "min-w-0 flex-1 italic leading-relaxed",
          indent === 2 ? "pl-8" : indent === 1 ? "pl-4" : "",
          kind === "title" && "text-[13px] font-bold text-ocs-header",
          kind === "section" && "text-[12px] font-bold text-ocs-highlight/80",
          kind === "sub" && "text-[12px] font-semibold text-ocs-muted",
          kind === "normal" && "text-[12px] text-ocs-muted",
        )}
      >
        {text}
      </p>
      {line.annotation && (
        <span className="shrink-0 whitespace-nowrap font-mono text-[12px] italic text-ocs-muted">
          {line.annotation}
        </span>
      )}
    </div>
  )
}

function ConsentButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  )
}
