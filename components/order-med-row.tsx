"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import type { OrderMed } from "@/lib/regimens"
import { applyCitopcinEdit, applyUrsaEdit } from "@/lib/order-schedule"
import { cn } from "@/lib/utils"

interface Props {
  med: OrderMed
  times: string[]
  onChange: (times: string[]) => void
  alt?: boolean
}

export function OrderMedRow({ med, times, onChange, alt }: Props) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] items-start gap-4 border-b border-ocs-border px-4 py-2",
        alt ? "bg-ocs-row-alt" : "bg-ocs-row",
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-ocs-text">{med.name}</p>
        <p className="truncate text-xs text-ocs-muted">{med.detail}</p>
      </div>
      <div className="shrink-0 text-right">
        {med.scheduleKind === "thiotepa" ? (
          <ThiotepaTime med={med} times={times} onChange={onChange} />
        ) : med.scheduleKind === "citopcin" ? (
          <CitopcinTime times={times} onChange={onChange} />
        ) : med.scheduleKind === "ursa" ? (
          <UrsaTime times={times} onChange={onChange} />
        ) : (
          <FixedTime times={times} />
        )}
      </div>
    </div>
  )
}

function FixedTime({ times }: { times: string[] }) {
  return (
    <span className="whitespace-nowrap font-mono text-sm text-ocs-time">
      {times.map((t) => `${t}/`).join("  ")}
    </span>
  )
}

function ThiotepaTime({ med, times, onChange }: { med: OrderMed; times: string[]; onChange: (t: string[]) => void }) {
  const current = times[0] ?? med.defaultTimes[0]
  return (
    <div className="flex items-center justify-end gap-1.5">
      <div className="relative">
        <select
          value={current}
          onChange={(e) => onChange([e.target.value])}
          className="appearance-none rounded border border-ocs-border bg-ocs-panel py-1 pl-2 pr-6 font-mono text-sm text-ocs-time outline-none focus:ring-1 focus:ring-ocs-highlight"
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
      <span className="whitespace-nowrap font-mono text-sm text-ocs-highlight">({med.suffix})/</span>
    </div>
  )
}

function CitopcinTime({ times, onChange }: { times: string[]; onChange: (t: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(() => setOpen(false))

  return (
    <div ref={ref} className="relative flex items-center justify-end gap-1 font-mono text-sm text-ocs-time">
      {times.map((t, i) => (
        <span key={i} className="relative">
          {i === 0 ? (
            <button
              type="button"
              onDoubleClick={() => setOpen((o) => !o)}
              className="rounded px-1 hover:bg-ocs-highlight/20"
              title="더블클릭하여 편집"
            >
              {t}/
            </button>
          ) : (
            <span className="px-1">{t}/</span>
          )}
        </span>
      ))}
      {open && (
        <EditMenu
          options={[
            { label: "12:00", onSelect: () => onChange(applyCitopcinEdit("12:00")) },
            { label: "삭제", onSelect: () => onChange(applyCitopcinEdit("delete")) },
          ]}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function UrsaTime({ times, onChange }: { times: string[]; onChange: (t: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(() => setOpen(false))

  return (
    <div ref={ref} className="relative flex items-center justify-end gap-1 font-mono text-sm text-ocs-time">
      {times.map((t, i) => (
        <span key={i} className="relative">
          {i === 0 ? (
            <button
              type="button"
              onDoubleClick={() => setOpen((o) => !o)}
              className="rounded px-1 hover:bg-ocs-highlight/20"
              title="더블클릭하여 편집"
            >
              {t}/
            </button>
          ) : (
            <span className="px-1">{t}/</span>
          )}
        </span>
      ))}
      {open && (
        <EditMenu
          options={[
            { label: "12:00", onSelect: () => onChange(applyUrsaEdit("12:00")) },
            { label: "18:00", onSelect: () => onChange(applyUrsaEdit("18:00")) },
          ]}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function EditMenu({
  options,
  onClose,
}: {
  options: { label: string; onSelect: () => void }[]
  onClose: () => void
}) {
  return (
    <ul
      role="listbox"
      className="absolute right-0 top-full z-10 mt-1 min-w-24 overflow-hidden rounded-md border border-ocs-border bg-ocs-panel shadow-lg"
    >
      {options.map((o) => (
        <li key={o.label}>
          <button
            type="button"
            onClick={() => {
              o.onSelect()
              onClose()
            }}
            className="block w-full px-3 py-1.5 text-left font-sans text-sm text-ocs-text hover:bg-ocs-highlight/30"
          >
            {o.label}
          </button>
        </li>
      ))}
    </ul>
  )
}

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [onClose])
  return ref
}
