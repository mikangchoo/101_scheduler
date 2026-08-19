"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { applyCitopcinEdit, applyUrsaEdit, type OrderMedWithMeta } from "@/lib/order-schedule"
import { cn } from "@/lib/utils"

interface Props {
  med: OrderMedWithMeta
  times: string[]
  onChange: (times: string[]) => void
  alt?: boolean
}

/**
 * 실제 처방되는 오더 행.
 * 레지멘 전문은 기울임체로 표시되고, 이 행(정자 + 수행시간)만 실제 오더다.
 * 용매가 있는 오더는 묶음(bundle)으로 표시하고 수행시간은 윗줄만 표기한다.
 */
export function OrderMedRow({ med, times, onChange, alt }: Props) {
  const bundled = Boolean(med.solvent)

  return (
    <div
      className={cn(
        "border-l-2 border-ocs-highlight",
        alt ? "bg-ocs-row-alt" : "bg-ocs-row",
      )}
    >
      {/* 본 오더 + 용매 줄만 묶음 대괄호로 감싼다 (+1 행은 제외) */}
      <div className={cn(bundled && "relative")}>
        {bundled && <BundleBracket />}

        <div
          className={cn(
            "grid grid-cols-[1fr_auto] items-start gap-4 px-3 py-1.5",
            bundled && "pl-6",
          )}
        >
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold not-italic text-ocs-text">
              {med.lastOralDose && <HoldIcon />}
              {med.sup && <Badge kind="SUP" />}
              <span className="truncate">{med.name}</span>
              {med.doseText && (
                <span className="whitespace-nowrap text-red-500 print:text-red-600">
                  {med.doseText}
                </span>
              )}
            </p>
            <p className="truncate text-[11px] not-italic text-ocs-muted">{med.detail}</p>
            {med.note && (
              <p className="mt-0.5 text-[11px] not-italic text-ocs-highlight/80">{med.note}</p>
            )}
          </div>

          <div className="shrink-0 text-right">
            {med.scheduleKind === "thiotepa" ? (
              <SelectTime med={med} times={times} onChange={onChange} />
            ) : med.scheduleKind === "citopcin" ? (
              <EditableTime
                times={times}
                options={[
                  { label: "12:00", onSelect: () => onChange(applyCitopcinEdit("12:00")) },
                  { label: "삭제", onSelect: () => onChange(applyCitopcinEdit("delete")) },
                ]}
              />
            ) : med.scheduleKind === "ursa" ? (
              <EditableTime
                times={times}
                options={[
                  { label: "12:00", onSelect: () => onChange(applyUrsaEdit("12:00")) },
                  { label: "18:00", onSelect: () => onChange(applyUrsaEdit("18:00")) },
                ]}
              />
            ) : (
              <FixedTime
                times={times}
                suffix={med.suffix}
                timeNote={med.timeNote}
                solo={med.solo}
                highlight={med.scheduleKind === "chemo"}
                rateNote={med.rateNote}
                endMark={med.endMark}
              />
            )}
          </div>
        </div>

        {/* 용매 줄 — 수행시간 없음 */}
        {med.solvent && (
          <div className="grid grid-cols-[1fr_auto] items-start gap-4 px-3 pb-1.5 pl-6">
            <p className="truncate text-[13px] not-italic text-ocs-text">
              {med.solvent}
              {med.solventDoseText && (
                <span className="ml-1 whitespace-nowrap text-red-500 print:text-red-600">
                  {med.solventDoseText}
                </span>
              )}
            </p>
            <span aria-hidden="true" />
          </div>
        )}
      </div>

      {/* 첫 투약 — +1 오더 (스케줄링 없음, 묶음 밖) */}
      {med.firstDose && (
        <div className="grid grid-cols-[1fr_auto] items-start gap-4 border-t border-ocs-border/60 px-3 py-1.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold not-italic text-ocs-text">
            <PlusOneIcon />
            <span className="truncate">{med.name}</span>
            {med.doseText && (
              <span className="whitespace-nowrap text-red-500 print:text-red-600">
                {med.doseText}
              </span>
            )}
          </p>
          <span aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

/** 묶음 오더 좌측 대괄호 */
function BundleBracket() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 w-2 rounded-l-sm border-y border-l border-ocs-text/70"
    />
  )
}

/** 경구약 첫 투약 시 생성되는 +1 아이콘 */
function PlusOneIcon() {
  return (
    <span className="not-italic rounded-sm bg-sky-600 px-1 py-[1px] text-[10px] font-bold leading-none text-white">
      +1
    </span>
  )
}

/** 경구약 마지막 투약 조제유보 아이콘 */
function HoldIcon() {
  return (
    <span
      title="조제유보"
      className="not-italic rounded-sm border border-ocs-text/60 bg-transparent px-1 py-[1px] text-[10px] font-bold leading-none text-ocs-text"
    >
      유보
    </span>
  )
}

/** PRN_order.png 스타일 상태 뱃지 */
export function Badge({ kind }: { kind: "SUP" | "PRN" | "TIT" }) {
  return (
    <span
      className={cn(
        "not-italic rounded-sm px-1 py-[1px] text-[10px] font-bold leading-none text-white",
        kind === "SUP" && "bg-emerald-600",
        kind === "PRN" && "bg-sky-700",
        kind === "TIT" && "bg-amber-600",
      )}
    >
      {kind}
    </span>
  )
}

function FixedTime({
  times,
  suffix,
  timeNote,
  solo,
  highlight,
  rateNote,
  endMark,
}: {
  times: string[]
  suffix?: string
  timeNote?: string
  solo?: boolean
  highlight?: boolean
  rateNote?: string
  endMark?: boolean
}) {
  return (
    <span className="whitespace-nowrap font-mono text-[13px] not-italic">
      <span className={highlight ? "text-ocs-highlight" : "text-ocs-time"}>
        {times.map((t, i) => (
          <span key={`${t}-${i}`}>
            {t}
            {i === 0 && rateNote && <span className="text-white">({rateNote})</span>}
            {"/ "}
          </span>
        ))}
        {endMark && <span className="ml-1 text-ocs-text">(end)</span>}
      </span>
      {solo && <span className="ml-1 text-ocs-muted">(단독)</span>}
      {suffix && <span className="ml-1 text-ocs-highlight">({suffix})</span>}
      {timeNote && <span className="ml-1 text-ocs-highlight/80">({timeNote})</span>}
    </span>
  )
}

function SelectTime({
  med,
  times,
  onChange,
}: {
  med: OrderMedWithMeta
  times: string[]
  onChange: (t: string[]) => void
}) {
  const current = times[0] ?? med.defaultTimes[0]
  return (
    <div className="flex items-center justify-end gap-1.5 not-italic">
      <div className="relative">
        <select
          value={current}
          onChange={(e) => onChange([e.target.value])}
          className="appearance-none rounded border border-ocs-border bg-ocs-panel py-0.5 pl-2 pr-6 font-mono text-[13px] text-ocs-time outline-none focus:ring-1 focus:ring-ocs-highlight"
          aria-label={`${med.name} 수행시간`}
        >
          {med.timeOptions?.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ocs-muted" />
      </div>
      {med.suffix && (
        <span className="whitespace-nowrap font-mono text-[13px] text-ocs-highlight">
          ({med.suffix})/
        </span>
      )}
      {med.timeNote && (
        <span className="whitespace-nowrap font-mono text-[13px] text-ocs-highlight/80">
          ({med.timeNote})
        </span>
      )}
    </div>
  )
}

function EditableTime({
  times,
  options,
}: {
  times: string[]
  options: { label: string; onSelect: () => void }[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(() => setOpen(false))

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-end gap-1 font-mono text-[13px] not-italic text-ocs-time"
    >
      {times.map((t, i) =>
        i === 0 ? (
          <button
            key={i}
            type="button"
            onDoubleClick={() => setOpen((o) => !o)}
            className="rounded px-1 hover:bg-ocs-highlight/20"
            title="더블클릭하여 편집"
          >
            {t}/
          </button>
        ) : (
          <span key={i} className="px-1">
            {t}/
          </span>
        ),
      )}
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-28 overflow-hidden rounded border border-ocs-border bg-ocs-panel shadow-lg">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                o.onSelect()
                setOpen(false)
              }}
              className="block w-full px-3 py-1.5 text-left text-[13px] text-ocs-text hover:bg-ocs-highlight/20"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])
  return ref
}
