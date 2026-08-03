"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Printer } from "lucide-react"
import { StepHeader } from "@/components/step-header"
import { useFlow } from "@/contexts/flow-context"
import { findRegimen } from "@/lib/regimens"
import { computeCalc, isValidPatient } from "@/lib/calc"
import { buildRegimenLines, type RenderLine } from "@/lib/regimen-render"
import { cn } from "@/lib/utils"

export default function RegimenConfirmPage() {
  const router = useRouter()
  const { regimenId, patient } = useFlow()
  const regimen = findRegimen(regimenId)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => setHydrated(true), [])

  useEffect(() => {
    if (!hydrated) return
    if (!regimen) router.replace("/")
    else if (!isValidPatient(patient)) router.replace("/patient")
  }, [hydrated, regimen, patient, router])

  const lines = useMemo<RenderLine[]>(() => {
    if (!isValidPatient(patient) || !regimenId) return []
    return buildRegimenLines(regimenId, computeCalc(patient))
  }, [patient, regimenId])

  if (!hydrated || !regimen || !isValidPatient(patient)) return null

  return (
    <main className="min-h-dvh bg-background">
      <StepHeader current={3} />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-balance text-xl font-semibold text-foreground">레지멘 확인</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {patient.name ? `${patient.name} · ` : ""}
              {regimen.label} · 계산된 용량이 반영된 레지멘입니다. 우측 빨간 값은 자동 계산치입니다.
            </p>
          </div>
        </div>

        {/* Printable regimen document */}
        <article className="print-area overflow-hidden rounded-xl border border-ocs-border bg-ocs-panel shadow-lg">
          <div className="max-h-[62vh] overflow-y-auto px-6 py-6 sm:px-8">
            {lines.map((line, i) => (
              <RegimenLineRow key={i} line={line} />
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

function RegimenLineRow({ line }: { line: RenderLine }) {
  const { text, annotation, kind = "normal", indent = 0 } = line

  if (kind === "spacer") return <div className="h-3" aria-hidden="true" />

  const indentClass = indent === 2 ? "pl-8" : indent === 1 ? "pl-4" : ""

  return (
    <div className="flex items-start justify-between gap-4 py-0.5">
      <p
        className={cn(
          "min-w-0 leading-relaxed text-ocs-text",
          indentClass,
          kind === "title" && "mb-1 text-base font-bold text-ocs-header",
          kind === "section" && "mt-1 text-sm font-bold text-ocs-highlight",
          kind === "sub" && "text-sm font-semibold text-ocs-text",
          kind === "normal" && "text-sm",
        )}
      >
        {text}
      </p>
      {annotation && (
        <span className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold text-red-400">{annotation}</span>
      )}
    </div>
  )
}
