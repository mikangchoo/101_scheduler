"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, RotateCcw } from "lucide-react"
import { StepHeader } from "@/components/step-header"
import { useFlow } from "@/contexts/flow-context"
import { isValidPatient } from "@/lib/calc"
import { findRegimen, isAlloRegimen } from "@/lib/regimens"

export default function DonePage() {
  const router = useRouter()
  const { regimenId, patient, scheduleSettings, reset } = useFlow()
  const regimen = findRegimen(regimenId)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => setHydrated(true), [])

  useEffect(() => {
    if (!hydrated) return
    if (!regimen?.available) router.replace("/")
    else if (!isValidPatient(patient)) router.replace("/patient")
    else if (isAlloRegimen(regimenId) && scheduleSettings.donorType == null) router.replace("/order")
  }, [hydrated, regimen, patient, regimenId, scheduleSettings.donorType, router])

  const ready =
    hydrated &&
    regimen?.available === true &&
    isValidPatient(patient) &&
    (!isAlloRegimen(regimenId) || scheduleSettings.donorType != null)

  function startOver() {
    reset()
    router.push("/")
  }

  if (!ready) return null

  return (
    <main className="min-h-dvh bg-background">
      <StepHeader current={5} />
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15">
          <CheckCircle2 className="h-9 w-9 text-accent" />
        </div>
        <h2 className="mt-6 text-balance text-2xl font-bold text-foreground">수고하셨습니다</h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          레지멘 확인과 오더 스케줄링이 모두 완료되었습니다. 새로운 환자의 스케줄을 작성하려면 처음부터 다시 시작하세요.
        </p>
        <button
          onClick={startOver}
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <RotateCcw className="h-4 w-4" />
          처음으로
        </button>
      </div>
    </main>
  )
}
