"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react"
import { StepHeader } from "@/components/step-header"
import { OrderMedRow } from "@/components/order-med-row"
import { useFlow } from "@/contexts/flow-context"
import { findRegimen } from "@/lib/regimens"
import { isValidPatient } from "@/lib/calc"
import { CONDITIONING_DAYS, formatDay, getOrderMedsForDay } from "@/lib/order-schedule"

/** times state keyed by `${day}:${medId}` */
type TimesState = Record<string, string[]>

export default function OrderPage() {
  const router = useRouter()
  const { regimenId, patient } = useFlow()
  const regimen = findRegimen(regimenId)
  const [hydrated, setHydrated] = useState(false)

  const [day, setDay] = useState<number>(CONDITIONING_DAYS[0])
  const [times, setTimes] = useState<TimesState>({})

  useEffect(() => setHydrated(true), [])

  useEffect(() => {
    if (!hydrated) return
    if (!regimen) router.replace("/")
    else if (!isValidPatient(patient)) router.replace("/patient")
  }, [hydrated, regimen, patient, router])

  const meds = useMemo(() => getOrderMedsForDay(regimenId, day), [regimenId, day])

  function timesFor(medId: string, fallback: string[]): string[] {
    return times[`${day}:${medId}`] ?? fallback
  }

  function setTimesFor(medId: string, next: string[]) {
    setTimes((prev) => ({ ...prev, [`${day}:${medId}`]: next }))
  }

  if (!hydrated || !regimen || !isValidPatient(patient)) return null

  return (
    <main className="min-h-dvh bg-background">
      <StepHeader current={4} />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-balance text-xl font-semibold text-foreground">오더 스케줄</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              컨디셔닝 날짜를 선택하면 해당 일자의 오더가 표시됩니다. 시간은 각 행에서 조정할 수 있습니다.
            </p>
          </div>

          {/* Day selector */}
          <label className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">컨디셔닝 날짜</span>
            <div className="relative">
              <select
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                className="appearance-none rounded-lg border border-border bg-card py-2 pl-3 pr-9 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
                aria-label="컨디셔닝 날짜 선택"
              >
                {CONDITIONING_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </label>
        </div>

        {/* OCS-style order window */}
        <div className="overflow-hidden rounded-xl border border-ocs-border shadow-lg">
          <div className="grid grid-cols-[1fr_auto] bg-ocs-header px-4 py-2.5 text-sm font-semibold text-white">
            <span>오더내역 — {formatDay(day)}</span>
            <span className="text-right">수행시간</span>
          </div>

          {meds.length === 0 ? (
            <div className="bg-ocs-row px-4 py-10 text-center text-sm text-ocs-muted">
              {formatDay(day)}에 예정된 오더가 없습니다.
            </div>
          ) : (
            meds.map((med, i) => (
              <OrderMedRow
                key={med.id}
                med={med}
                times={timesFor(med.id, med.defaultTimes)}
                onChange={(t) => setTimesFor(med.id, t)}
                alt={i % 2 === 1}
              />
            ))
          )}
        </div>

        <p className="mt-3 text-xs text-ocs-muted">
          Citopcin / Ursa 는 첫 시간을 더블클릭하여 편집할 수 있습니다. Thiotepa 는 목록에서 수행시간을 선택합니다.
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
