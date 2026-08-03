import type { CalcResult } from "@/lib/calc"
import { round } from "@/lib/calc"

export type LineKind = "title" | "section" | "sub" | "normal" | "spacer"

export interface RenderLine {
  text: string
  /** right-aligned red computed annotation */
  annotation?: string
  kind?: LineKind
  /** indent level (0-2) */
  indent?: number
}

function n(v: number, decimals = 0): string {
  return round(v, decimals).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Build the ThioBuCy regimen document with patient-specific values filled in. */
function buildThioBuCy(c: CalcResult): RenderLine[] {
  const thiotepaMg = n(200 * c.bsa, 1)
  const busulfanMg = n(3.2 * c.busulfanWeight, 0)
  const cycloMg = n(60 * c.tbw, 0)
  const hyd3 = n((3000 * c.bsa) / 24, 0)
  const hyd15 = n((1500 * c.bsa) / 24, 0)
  const gcsfLow = n(5 * c.tbw, 0)
  const gcsfHigh = n(10 * c.tbw, 0)

  return [
    { text: "Thio/Bu/Cy Conditioning for AutoSCT (8 days regimen)", kind: "title" },
    { text: "", kind: "spacer" },
    { text: `Actual Bwt: ${n(c.tbw, 1)} Kg`, kind: "sub" },
    { text: `ABW25: ${n(c.abw25, 1)} Kg`, kind: "sub" },
    { text: `BSA: ${n(c.bsa, 2)} m²`, kind: "sub" },
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section" },
    { text: `Thiotepa ${thiotepaMg} mg (200mg/m²) miv over 60min (with 0.22μm filter)` },
    { text: "NS 500ml [농도범위에 따라 변환가능, 0.5~1mg/ml]", indent: 1 },
    { text: "D-8, D-7, D-6", indent: 1 },
    { text: "", kind: "spacer" },

    { text: `IV Busulfan ${busulfanMg} mg (3.2mg/kg) miv over 3hrs qd` },
    { text: "N/S 250~500mL [0.5mg/ml 이상, 0.5mg/mL 근접 시 가장 안정]", indent: 1 },
    { text: "D-5, D-4", indent: 1 },
    { text: "with Sz prophylaxis:", indent: 1 },
    { text: "Busulfan 투약 3-4시간 전 Levetiracetam 1500mg po loading (D-5)", indent: 2 },
    { text: "→ 다음날 500mg PO bid (D-4, D-3), GFR 30 미만인 경우 250mg bid", indent: 2 },
    { text: "", kind: "spacer" },

    { text: `Cyclophosphamide ${cycloMg} mg (60mg/kg) miv over 1 hr` },
    { text: "D5W 200ml", indent: 1 },
    { text: "D-3, D-2", indent: 1 },
    { text: "※ Hemorrhagic cystitis prevention", indent: 1 },
    { text: "a) Mesna 1000mg/NS50ml IVs q 6 hr (Start at -30 min before CTX) D-3, D-2", indent: 2 },
    { text: "b) Hydration", indent: 2 },
    { text: "D5WNa77K20 (NaK2V)", indent: 2 },
    { text: "3L/m²/day, D-3 – D0,", indent: 2, annotation: `${hyd3} cc/hr` },
    { text: "1.5L/m²/day, D1 – D4, then tapering, check serum electrolyte", indent: 2, annotation: `${hyd15} cc/hr` },
    { text: "Furosemide 10mg (D-3 – D0, 이후 PRN)", indent: 2 },
    { text: "check urine output q 6 hr, if 6hr u/o < 1L or 150ml/hr, furosemide 1A ivs", indent: 2 },
    { text: "ECG monitor & CK/LD level (D-3 – D1)", indent: 2 },
    { text: "", kind: "spacer" },

    { text: "2) Stem cell infusion", kind: "section" },
    { text: "At least 48 hrs after the completion of chemotherapy", indent: 1 },
    { text: "Premed: Chlorpheniramine 4mg (-15 min)", indent: 1 },
    { text: "Stem cell infusion: over 5-10 min per bag", indent: 1 },
    { text: "Check V/S q 30min x4, q 1hr x4", indent: 1 },
    { text: "Washing infusion tubing with saline", indent: 1 },
    { text: "Keep at bedside for 1 hour after stem cell infusion", indent: 1 },
    { text: "", kind: "spacer" },

    { text: "3) Supportive care", kind: "section" },
    { text: "Gut decontamination: Ciprofloxacin 500mg po bid (D-8 to ANC > 1,000)" },
    { text: "VOD prophylaxis: UDCA 200mg tid PO (D-7 – D+21 혹은 생착 시까지)" },
    { text: "Fungal prophylaxis: Micafungin 50mg qd IV (D-8 – ANC>1000 for 3 consecutive days)" },
    { text: "CMV prophylaxis: IVIg 500mg/kg iv (D7부터 2주 간격, 3개월까지 격주 500mg/kg, 이후 6개월까지 매월 500mg/kg, 최장 9개월 급여)" },
    { text: "G-CSF: Filgrastim 5-10 ug/kg SQ or MIVs (보험기준상 ANC 3000까지 투여 가능)", annotation: `${gcsfLow}~${gcsfHigh} ug` },
    { text: "Vit K 10mg iv weekly" },
    { text: "", kind: "spacer" },

    { text: "Antiemetics:", kind: "sub" },
    { text: "D-8  Palonosetron 0.25mg IV + Olanzapine 10mg qd [D]", indent: 1 },
    { text: "D-7~D-6  Olanzapine 10mg qd [D]", indent: 1 },
    { text: "D-5~D-4  Serotonin antagonist IV", indent: 1 },
    { text: "고위험군 (D-3, D-2)", indent: 1 },
    { text: "D-3  aprepitant 125mg PO + Serotonin antagonist IV + dexamethasone 12mg iv", indent: 2 },
    { text: "D-2, D-1  aprepitant 80mg PO + dexamethasone 8mg", indent: 2 },
    { text: "or D-3 Fosaprepitant 150mg + Serotonin antagonist + dexamethasone 12mg iv", indent: 2 },
    { text: "   D-2, D-1 dexamethasone 8mg", indent: 2 },
    { text: "or D-3 Netupitant 300mg/Palonosetron 0.5mg PO qd + dexamethasone 12mg iv", indent: 2 },
    { text: "   D-2, D-1 dexamethasone 8mg po or iv qd", indent: 2 },
    { text: "prn) lorazepam 0.5-2mg IV q4-6h OR metoclopramide 10mg IV q8h or olanzapine[D] 10mg po", indent: 1 },
    { text: "* olanzapine 투여 시 metoclopramide 병용 금기", indent: 1 },
    { text: "", kind: "spacer" },

    { text: "4) Lab F/U", kind: "section" },
    { text: "1. daily CBC", indent: 1 },
    { text: "2. Adm batt, e', Mg, Coagulation, U/A (2/week): daily e' B/Cr (D-8 – D0)", indent: 1 },
    { text: "3. Weekly ECG, CPA", indent: 1 },
    { text: "4. 1주마다 CMV antigenemia check", indent: 1 },
  ]
}

const BUILDERS: Record<string, (c: CalcResult) => RenderLine[]> = {
  thiobucy: buildThioBuCy,
}

export function buildRegimenLines(regimenId: string | null, calc: CalcResult): RenderLine[] {
  if (!regimenId) return []
  const builder = BUILDERS[regimenId]
  return builder ? builder(calc) : []
}
