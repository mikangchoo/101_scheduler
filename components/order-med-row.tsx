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
  const bundled = Boolean(med.solvent || med.bundleItems?.length)
  const firstDoseDetail = med.firstDoseDetail ?? med.detail
  const hideDoseOnFirstDose =
    med.id.startsWith("cyclosporine") || med.id.startsWith("tacrolimus")
  const showHoldFirstDose =
    med.holdFirstDose === true ||
    (!med.noHoldFirstDose &&
      (times[0] === "18:00" ||
        (times[0] === "20:00" &&
          (med.id.startsWith("citopcin") || med.id.startsWith("acyclovir")))))

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
            "grid grid-cols-1 items-start gap-1 px-3 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4",
            bundled && "pl-6",
          )}
        >
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold not-italic text-ocs-text">
              {(med.lastOralDose || med.holdMainOrder) && <HoldIcon />}
              {med.controlled && <Badge kind="향정" />}
              {med.prnBadge && <Badge kind="PRN" />}
              {med.tit && <Badge kind="TIT" />}
              {med.sup && <Badge kind="SUP" />}
              <span className="break-words">{med.name}</span>
              {med.doseText && (
                <span className="whitespace-nowrap text-red-500 print:text-red-600">
                  {med.doseText}
                </span>
              )}
            </p>
            <p className="break-words text-[11px] not-italic text-ocs-muted">{med.detail}</p>
            {med.note && (
              <p className="mt-0.5 break-words text-[11px] not-italic text-ocs-highlight/80">{med.note}</p>
            )}
          </div>

          {times.length > 0 && (
            <div
              className={cn(
                "min-w-0 text-left sm:shrink-0 sm:text-right",
                bundled && "hidden sm:block",
              )}
            >
              <ScheduleControl med={med} times={times} onChange={onChange} />
            </div>
          )}
        </div>

        {/* 용매 줄 — 수행시간 없음 */}
        {med.solvent && (
          <div className="grid grid-cols-1 items-start gap-1 px-3 pb-1.5 pl-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
            <p className="break-words text-[13px] not-italic text-ocs-text">
              {med.solvent}
              {med.solventDoseText && (
                <span
                  className={cn(
                    "ml-1 whitespace-nowrap",
                    med.solventDoseCalculated
                      ? "text-red-500 print:text-red-600"
                      : "text-ocs-text",
                  )}
                >
                  {med.solventDoseText}
                </span>
              )}
            </p>
            <span aria-hidden="true" />
          </div>
        )}

        {med.bundleItems?.map((item) => (
          <div
            key={`${med.id}-${item.name}`}
            className="grid grid-cols-1 items-start gap-1 px-3 pb-1.5 pl-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
          >
            <div className="min-w-0">
              <p className="break-words text-[13px] font-semibold not-italic text-ocs-text">{item.name}</p>
              {item.detail && (
                <p className="break-words text-[11px] not-italic text-ocs-muted">{item.detail}</p>
              )}
            </div>
            <span aria-hidden="true" />
          </div>
        ))}

        {/* 좁은 화면의 묶음오더는 용매·추가 구성품 다음에 수행시간을 표시한다. */}
        {bundled && times.length > 0 && (
          <div className="px-3 pb-1.5 pl-6 pt-1 text-left sm:hidden">
            <ScheduleControl med={med} times={times} onChange={onChange} />
          </div>
        )}
      </div>

      {/* 첫 투약 — +1 오더 (스케줄링 없음, 묶음 밖) */}
      {med.firstDose && (
        <div className="grid grid-cols-1 items-start gap-1 border-t border-ocs-border/60 px-3 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold not-italic text-ocs-text">
              <PlusOneIcon />
              {showHoldFirstDose && <HoldIcon />}
              {med.controlled && <Badge kind="향정" />}
              <span className="break-words">{med.name}</span>
              {med.doseText && !hideDoseOnFirstDose && (
                <span className="whitespace-nowrap text-red-500 print:text-red-600">
                  {med.doseText}
                </span>
              )}
            </p>
            {med.repeatDetailOnFirstDose && firstDoseDetail && (
              <p className="break-words text-[11px] not-italic text-ocs-muted">{firstDoseDetail}</p>
            )}
            {med.bundleItems?.map((item) => (
              <div className="mt-1 min-w-0" key={`${med.id}-first-${item.name}`}>
                <p className="flex flex-wrap items-center gap-1.5 break-words text-[13px] font-semibold not-italic text-ocs-text">
                  <PlusOneIcon />
                  {showHoldFirstDose && <HoldIcon />}
                  <span>{item.name}</span>
                </p>
                {item.detail && (
                  <p className="break-words text-[11px] not-italic text-ocs-muted">{item.detail}</p>
                )}
              </div>
            ))}
          </div>
          <span aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

function ScheduleControl({ med, times, onChange }: Pick<Props, "med" | "times" | "onChange">) {
  if (med.scheduleKind === "thiotepa") {
    return <SelectTime med={med} times={times} onChange={onChange} />
  }
  if (med.scheduleKind === "citopcin") {
    return (
      <EditableTime
        times={times}
        options={[
          { label: "12:00", onSelect: () => onChange(applyCitopcinEdit("12:00")) },
          { label: "삭제", onSelect: () => onChange(applyCitopcinEdit("delete")) },
        ]}
      />
    )
  }
  if (med.scheduleKind === "ursa") {
    return (
      <EditableTime
        times={times}
        options={[
          { label: "12:00", onSelect: () => onChange(applyUrsaEdit("12:00")) },
          { label: "18:00", onSelect: () => onChange(applyUrsaEdit("18:00")) },
        ]}
      />
    )
  }
  return (
    <FixedTime
      times={times}
      suffix={med.suffix}
      suffixEachTime={med.suffixEachTime}
      firstTimeNote={med.firstTimeNote}
      timeNote={med.timeNote}
      solo={med.solo}
      rateNote={med.rateNote}
      endMark={med.endMark}
    />
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
/** 경구약 마지막 투약 조제유보 아이콘 */
function HoldIcon() {
  return (
    <span
      title="조제유보"
      className="not-italic rounded-sm bg-pink-500 px-1 py-[1px] text-[10px] font-bold leading-none text-white"
    >
      조제유보
    </span>
  )
}

/** PRN_order.png 스타일 상태 뱃지 */
export function Badge({ kind }: { kind: "SUP" | "PRN" | "TIT" | "향정" }) {
  return (
    <span
      className={cn(
        "not-italic rounded-sm px-1 py-[1px] text-[10px] font-bold leading-none text-white",
        kind === "SUP" && "bg-[#27788f]",
        kind === "PRN" && "bg-emerald-600",
        kind === "TIT" && "bg-amber-600",
        kind === "향정" && "bg-fuchsia-600",
      )}
    >
      {kind}
    </span>
  )
}

function FixedTime({
  times,
  suffix,
  suffixEachTime,
  firstTimeNote,
  timeNote,
  solo,
  rateNote,
  endMark,
}: {
  times: string[]
  suffix?: string
  suffixEachTime?: boolean
  firstTimeNote?: string
  timeNote?: string
  solo?: boolean
  rateNote?: string
  endMark?: boolean
}) {
  const lastIndex = times.length - 1

  return (
    <span className="inline-flex max-w-full flex-wrap items-center whitespace-normal break-words font-mono text-[13px] not-italic">
      <span className="inline-flex flex-wrap gap-x-4 gap-y-1">
        {times.map((t, i) => {
          const match = t.match(/^([^()]+)(?:\((.*)\))?$/)
          const time = match?.[1] ?? t
          const inlineNote = match?.[2]
          return (
            <span className="inline-flex items-center" key={`${t}-${i}`}>
              <span className="text-ocs-time">{time}</span>
              {inlineNote && <span className="text-ocs-highlight">({inlineNote})</span>}
              {suffixEachTime && suffix && (
                <span className="text-ocs-highlight">({suffix})</span>
              )}
              {i === 0 && firstTimeNote && (
                <span className="text-ocs-highlight">({firstTimeNote})</span>
              )}
              {i === 0 && rateNote && (
                <span className="text-ocs-highlight">({rateNote})</span>
              )}
              {i === lastIndex && solo && <span className="text-ocs-highlight">(단독)</span>}
              {i === lastIndex && suffix && !suffixEachTime && (
                <span className="text-ocs-highlight">({suffix})</span>
              )}
              {i === lastIndex && timeNote && (
                <span className="text-ocs-highlight">({timeNote})</span>
              )}
              {i === lastIndex && endMark && <span className="text-ocs-highlight">(end)</span>}
              <span className="text-ocs-time">/</span>
            </span>
          )
        })}
      </span>
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
    <div className="flex max-w-full flex-wrap items-center justify-start not-italic sm:justify-end">
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
        <span className="whitespace-normal font-mono text-[13px] text-ocs-highlight">
          ({med.suffix})
        </span>
      )}
      {med.timeNote && (
        <span className="whitespace-normal font-mono text-[13px] text-ocs-highlight">
          ({med.timeNote})
        </span>
      )}
      <span className="font-mono text-[13px] text-ocs-time">/</span>
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
      className="relative flex max-w-full flex-wrap items-center justify-start gap-1 font-mono text-[13px] not-italic text-ocs-time sm:justify-end"
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
