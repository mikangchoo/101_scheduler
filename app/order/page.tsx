"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react"
import { StepHeader } from "@/components/step-header"
import { Badge, OrderMedRow } from "@/components/order-med-row"
import { useFlow } from "@/contexts/flow-context"
import { findRegimen, isAutoRegimen } from "@/lib/regimens"
import { computeCalc, isValidPatient } from "@/lib/calc"
import { formatDay, getOrderDaysForRegimen, getPullLimitMin } from "@/lib/order-schedule"
import type { OrderMedWithMeta } from "@/lib/order-schedule"
import { buildOrderWindow, effectiveSettings, PRN_ORDERS } from "@/lib/order-window"
import { describeStart, NO_CONSENT_OPTIONS, type NoConsentStart } from "@/lib/schedule-settings"
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
    if (!regimen?.available) router.replace("/")
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
      timeOverrides: times,
    })
  }, [regimenId, patient, doseOverrides, day, days, scheduleSettings, times])

  // 동의서 / 당기기 설정이 변하면 계산값을 다시 쓰도록 수동 편집분 초기화
  useEffect(() => {
    setTimes({})
  }, [
    scheduleSettings.consentReceived,
    scheduleSettings.noConsentStart,
    scheduleSettings.pullForward,
    scheduleSettings.donorType,
  ])

  useEffect(() => {
    setTimes({})
  }, [regimenId])

  function timesFor(medId: string, fallback: string[]): string[] {
    return times[`${day}:${medId}`] ?? fallback
  }

  function setTimesFor(medId: string, next: string[]) {
    setTimes((prev) => ({ ...prev, [`${day}:${medId}`]: next }))
  }

  function setPullForward(value: boolean) {
    setScheduleSettings((s) => ({
      ...s,
      pullForward: { ...(s.pullForward ?? {}), [day]: value },
    }))
  }

  function dayLabel(value: number): string {
    return regimenId === "fc" && value === 1 ? "D1" : formatDay(value)
  }

  const prnTimes = useMemo(() => {
    if (!window_) return {}
    const infusionTime = regimenId === "fc" ? null : isAutoRegimen(regimenId) ? "14:00" : "17:00"
    return getPrnTimes(day, window_.meds, times, infusionTime, regimenId)
  }, [day, window_, times, regimenId])

  const donorReady = regimenId !== "tbi-cy" || scheduleSettings.donorType != null

  if (!hydrated || !regimen?.available || !isValidPatient(patient) || !window_) return null

  const firstDay = window_.firstChemoDay ?? day
  const isFirstDay = window_.isFirstDay
  const applied = effectiveSettings(scheduleSettings, day, firstDay)
  const pulled = (scheduleSettings.pullForward ?? {})[day] === true
  const pullLimitMin = getPullLimitMin(regimenId, day)

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

        {regimenId === "tbi-cy" && (
          <section className="mb-6 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium text-foreground">공여자 유형을 선택하세요</p>
            <p className="mt-1 text-xs text-muted-foreground">
              혈연은 CsA + MTX, 비혈연은 Tacrolimus + MTX + ATG 오더만 표시됩니다. 선택 전에는 공여자별
              면역억제 오더를 표시하지 않습니다.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ChoiceButton
                active={scheduleSettings.donorType === "related"}
                onClick={() => setScheduleSettings((s) => ({ ...s, donorType: "related" }))}
                label="혈연 공여자"
              />
              <ChoiceButton
                active={scheduleSettings.donorType === "unrelated"}
                onClick={() => setScheduleSettings((s) => ({ ...s, donorType: "unrelated" }))}
                label="비혈연 공여자"
              />
            </div>
            {scheduleSettings.donorType == null && (
              <p className="mt-2 text-xs font-medium text-ocs-highlight">
                공여자 유형을 선택해야 CsA 또는 Tacrolimus/ATG 실제 오더가 생성됩니다.
              </p>
            )}
          </section>
        )}

        {/* 첫 항암 투약일: 동의서 여부 / 이후: 항암제 당기기 */}
        <section className="mb-6 rounded-xl border border-border bg-card p-4">
          {isFirstDay ? (
            <>
              <p className="text-sm font-medium text-foreground">동의서가 있습니까?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                첫 항암 투약일({dayLabel(firstDay)})의 항암제 시작 시간을 결정합니다.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ChoiceButton
                  active={scheduleSettings.consentReceived === true}
                  onClick={() => setScheduleSettings((s) => ({ ...s, consentReceived: true }))}
                  label="예 (11:00 시작)"
                />
                <ChoiceButton
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
                      {NO_CONSENT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{describeStart(scheduleSettings)}</p>
            </>
          ) : window_.hasChemo && window_.firstChemoDay != null && day > window_.firstChemoDay ? (
            <>
              <p className="text-sm font-medium text-foreground">항암제를 당길까요?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                전일 투약시간을 기준으로 최대 {pullLimitMin / 60}시간 당깁니다
                {pullLimitMin === 60 ? " (Busulfan 연속 투약 → 1시간 제한)" : ""}.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ChoiceButton active={pulled} onClick={() => setPullForward(true)} label="예" />
                <ChoiceButton active={!pulled} onClick={() => setPullForward(false)} label="아니오" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {dayLabel(day)} · {describeStart(applied)}
                {pulled ? ` · ${pullLimitMin}분 당김 적용` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">항암 시간 조정 없음</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {dayLabel(day)}은 실제 항암제 투약일이 아닙니다. TBI 같은 시술 시간은 해당 오더의 시간 선택에서
                조정하고, 동의서와 항암제 당기기는 실제 항암 투약일에만 적용합니다.
              </p>
            </>
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
              {dayLabel(d)}
            </button>
          ))}
        </div>

        {/* OCS-style order window: 레지멘 전문 + 실제 오더 */}
        <div className="overflow-hidden rounded-xl border border-ocs-border shadow-lg">
          <div className="grid grid-cols-1 gap-1 bg-ocs-header px-3 py-2 text-[13px] font-semibold text-white sm:grid-cols-[minmax(0,1fr)_auto]">
            <span>약품처방 — {dayLabel(day)}</span>
            <span className="sm:text-right">수행시간</span>
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
          <div className="grid grid-cols-1 gap-1 border-t border-ocs-border bg-ocs-header px-3 py-2 text-[13px] font-semibold text-white sm:grid-cols-[minmax(0,1fr)_auto]">
            <span>PRN order</span>
            <span className="sm:text-right">수행시간</span>
          </div>
          {PRN_ORDERS.map((o, i) => (
            <div
              key={o.id}
              className={cn(
                "grid grid-cols-1 items-start gap-1 border-b border-ocs-border px-3 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4",
                i % 2 === 1 ? "bg-ocs-row-alt" : "bg-ocs-row",
              )}
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ocs-text">
                  <Badge kind={o.badge} />
                  <span className="break-words">{o.name}</span>
                </p>
                <p className="break-words text-[11px] text-ocs-muted">{o.detail}</p>
              </div>
              <PrnTimes times={prnTimes[o.id]} />
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-ocs-muted">
          항암제는 연속 투약되도록 순차 배치되며, antiemetics IV 는 첫 항암제 30분 전으로 스케줄링됩니다. 묶음
          오더는 수행시간을 첫 줄에만 표기합니다.
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
            onClick={() => {
              if (donorReady) router.push("/done")
            }}
            disabled={!donorReady}
            title={donorReady ? "완료 단계로 이동" : "공여자 유형을 먼저 선택하세요"}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors",
              donorReady
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "cursor-not-allowed bg-muted text-muted-foreground",
            )}
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
    <div className="flex flex-col items-start gap-0.5 px-3 py-[1px] sm:flex-row sm:gap-3">
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
        <span className="whitespace-normal break-words font-mono text-[12px] italic text-ocs-muted sm:shrink-0 sm:text-right">
          {line.annotation}
        </span>
      )}
    </div>
  )
}

function getPrnTimes(
  day: number,
  meds: OrderMedWithMeta[],
  times: TimesState,
  infusionTime: string | null,
  regimenId: string | null,
): Record<string, string[]> {
  const nsTimes: string[] = []
  const d5wTimes: string[] = []
  let d5wCount = 0

  for (const med of meds) {
    if (med.scheduleKind !== "chemo") continue
    const medTimes = times[`${day}:${med.id}`] ?? med.defaultTimes
    const solvent = med.solvent?.toLowerCase() ?? ""
    if (solvent.includes("dextrose") || solvent.includes("d5w")) {
      d5wTimes.push(...medTimes)
      d5wCount += 1
    } else {
      nsTimes.push(...medTimes)
    }
  }

  // 주입술 시간 = Allo 17:00 / Auto 14:00, D0 에만 NS 고정 스케줄
  const d0Ns = day === 0 && infusionTime ? [infusionTime, infusionTime] : []
  const fcD1Ns = regimenId === "fc" && day === 1 ? ["00:00"] : []
  const hasScheduledLasix10mg = meds.some(
    (med) =>
      med.id.startsWith("furosemide 10mg") &&
      med.scheduleKind === "fixed" &&
      med.defaultTimes.includes("06:00"),
  )

  return {
    ns100: [...d0Ns, ...fcD1Ns],
    ns50: [...d0Ns, ...fcD1Ns, ...nsTimes],
    d5w50: [...d5wTimes],
    d5w20: Array.from({ length: d5wCount * 2 }, () => "00:00"),
    lasix: hasScheduledLasix10mg ? ["06:00(UO<1L)", "12:00", "18:00"] : [],
    "chlorph-prn": [],
  }
}

function PrnTimes({ times }: { times?: string[] }) {
  if (!times?.length) {
    return (
      <span className="font-mono text-[13px] text-ocs-muted sm:text-right">PRN/</span>
    )
  }

  return (
    <span className="inline-flex flex-wrap justify-start gap-x-4 gap-y-1 whitespace-normal break-words font-mono text-[13px] sm:justify-end">
      {times.map((value, index) => {
        const match = value.match(/^([^()]+)(?:\((.*)\))?$/)
        const time = match?.[1] ?? value
        const annotation = match?.[2]

        return (
          <span className="inline-flex items-center" key={`${value}-${index}`}>
            <span className="text-ocs-time">{time}/</span>
            {annotation && <span className="text-ocs-highlight">({annotation})</span>}
          </span>
        )
      })}
    </span>
  )
}

function ChoiceButton({
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
