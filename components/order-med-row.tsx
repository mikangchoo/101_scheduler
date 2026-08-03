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
 */
export function OrderMedRow({ med, times, onChange, alt }: Props) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] items-start gap-4 border-l-2 border-ocs-highlight px-3 py-1.5",
        alt ? "bg-ocs-row-alt" : "bg-ocs-row",
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold not-italic text-ocs-text">
          {med.sup && <Badge kind="SUP" />}
          <span className="truncate">{med.name}</span>
        </p>
        <p className="truncate text-[11px] not-italic text-ocs-muted">{med.detail}</p>
        {med.note && <p className="mt-0.5 text-[11px] not-italic text-ocs-highlight/80">{med.note}</p>}
      </div>

      <div className="shrink-0 text-right">
        {med.scheduleKind === "thiotepa" ? (
          <ThiotepaTime med={med} times={times} onChange={onChange} />
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
          <FixedTime times={times} suffix={med.suffix} highlight={med.scheduleKind === "chemo"} />
        )}
      </div>
    </div>
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
  highlight,
}: {
  times: string[]
  suffix?: string
  highlight?: boolean
}) {
  return (
    <span className="whitespace-nowrap font-mono text-[13px] not-italic">
      <span className={highlight ? "text-ocs-highlight" : "text-ocs-time"}>
        {times.map((t) => `${t}/`).join(" ")}
      </span>
      {suffix && <span className="ml-1 text-ocs-highlight">({suffix})</span>}
    </span>
  )
}

function ThiotepaTime({
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
        <span className="whitespace-nowrap font-mono text-[13px] text-ocs-highlight">({med.suffix})/</span>
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
