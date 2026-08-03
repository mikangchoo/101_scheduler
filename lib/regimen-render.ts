import type { CalcResult } from "@/lib/calc"
import { round } from "@/lib/calc"
import { type DoseKey, type DoseOverrides, mergeDoseOverrides } from "@/lib/dose-overrides"

export type LineKind = "title" | "section" | "sub" | "normal" | "spacer"

/** A run of text inside a line. */
export interface Segment {
  text: string
  /** red computed value */
  red?: boolean
  /** editable chemo dose token (double-click to edit the raw per-kg/per-m² value) */
  dose?: {
    key: DoseKey
    /** unit suffix shown after the number, e.g. "mg/m²", "mg/kg" */
    unit: string
  }
}

export interface RenderLine {
  /** plain text (used when there are no segments) */
  text?: string
  /** rich segments (computed red values + editable dose tokens) */
  segments?: Segment[]
  /** right-aligned red computed annotation */
  annotation?: string
  kind?: LineKind
  /** indent level (0-2) */
  indent?: number
  /** render text in italics (regimen source notes) */
  italic?: boolean
  /** show a leading order checkbox (□) */
  checkbox?: boolean
  /** stable id for checkbox state */
  id?: string
}

function n(v: number, decimals = 0): string {
  return round(v, decimals).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** number formatting for dose tokens (drop trailing zeros) */
function d(v: number): string {
  return String(round(v, 2))
}

type Doses = Record<DoseKey, number>

/* ------------------------------------------------------------------ *
 * ThioBuCy
 * ------------------------------------------------------------------ */
function buildThioBuCy(c: CalcResult, dose: Doses): RenderLine[] {
  const thiotepaMg = n(dose.thiotepa_mg_m2 * c.bsa, 1)
  const busulfanMg = n(dose.busulfan_mg_kg * c.busulfanWeight, 0)
  const cycloMg = n(dose.cyclo_mg_kg * c.tbw, 0)
  const hyd3 = n((3000 * c.bsa) / 24, 0)
  const hyd15 = n((1500 * c.bsa) / 24, 0)
  const gcsfLow = n(5 * c.tbw, 0)
  const gcsfHigh = n(10 * c.tbw, 0)
  const cycloHasIce = dose.cyclo_mg_kg >= 60

  return [
    { text: "Thio/Bu/Cy Conditioning for AutoSCT (8 days regimen)", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c),
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section", italic: true },
    {
      checkbox: true,
      id: "thiotepa",
      segments: [
        { text: "Thiotepa " },
        { text: `${thiotepaMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.thiotepa_mg_m2)}`, dose: { key: "thiotepa_mg_m2", unit: "mg/m²" } },
        { text: "mg/m²) miv over 60min (with 0.22μm filter)" },
      ],
    },
    { text: "NS 500ml [농도범위에 따라 변환가능, 0.5~1mg/ml]", indent: 1, italic: true },
    { text: "D-8, D-7, D-6", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "busulfan",
      segments: [
        { text: "IV Busulfan " },
        { text: `${busulfanMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.busulfan_mg_kg)}`, dose: { key: "busulfan_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) miv over 3hrs qd" },
      ],
    },
    { text: "N/S 250~500mL [0.5mg/ml 이상, 0.5mg/mL 근접 시 가장 안정]", indent: 1, italic: true },
    { text: "D-5, D-4", indent: 1, italic: true },
    { text: "with Sz prophylaxis:", indent: 1, italic: true },
    { text: "Busulfan 투약 3-4시간 전 Levetiracetam 1500mg po loading (D-5)", indent: 2, italic: true, checkbox: true, id: "levetiracetam" },
    { text: "→ 다음날 500mg PO bid (D-4, D-3), GFR 30 미만인 경우 250mg bid", indent: 2, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "cyclophosphamide",
      annotation: cycloHasIce ? "얼음/EKG" : undefined,
      segments: [
        { text: "Cyclophosphamide " },
        { text: `${cycloMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.cyclo_mg_kg)}`, dose: { key: "cyclo_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) miv over 1 hr" },
      ],
    },
    { text: "D5W 200ml", indent: 1, italic: true },
    { text: "D-3, D-2", indent: 1, italic: true },
    { text: "※ Hemorrhagic cystitis prevention", indent: 1, italic: true },
    { text: "a) Mesna 1000mg/NS50ml IVs q 6 hr (Start at -30 min before CTX) D-3, D-2", indent: 2, italic: true },
    { text: "b) Hydration", indent: 2, italic: true },
    { text: "D5WNa77K20 (NaK2V)", indent: 2, italic: true },
    { text: "3L/m²/day, D-3 – D0,", indent: 2, italic: true, annotation: `${hyd3} cc/hr` },
    { text: "1.5L/m²/day, D1 – D4, then tapering, check serum electrolyte", indent: 2, italic: true, annotation: `${hyd15} cc/hr` },
    { text: "Furosemide 10mg (D-3 – D0, 이후 PRN)", indent: 2, italic: true },
    { text: "check urine output q 6 hr, if 6hr u/o < 1L or 150ml/hr, furosemide 1A ivs", indent: 2, italic: true },
    { text: "ECG monitor & CK/LD level (D-3 – D1)", indent: 2, italic: true },
    { text: "", kind: "spacer" },

    ...stemCellInfusion(),
    ...thioBuCySupportive(`${gcsfLow}~${gcsfHigh} ug`),
    ...highRiskAntiemetics(),
    ...labFU(),
  ]
}

/* ------------------------------------------------------------------ *
 * HDMEL — High dose Melphalan
 * ------------------------------------------------------------------ */
function buildHDMEL(c: CalcResult, dose: Doses): RenderLine[] {
  const melMg = n(dose.melphalan_mg_m2 * c.bsa, 1)

  return [
    { text: "High dose Melphalan Conditioning for AutoSCT", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c, false),
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section", italic: true },
    {
      checkbox: true,
      id: "melphalan",
      annotation: "얼음/차광",
      segments: [
        { text: "Melphalan " },
        { text: `${melMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.melphalan_mg_m2)}`, dose: { key: "melphalan_mg_m2", unit: "mg/m²" } },
        { text: "mg/m²) miv over 30 min" },
      ],
    },
    { text: "N/S 500mL [농도범위에 따라 변환가능, 0.45 mg/mL 이하] (용해 즉시 투여)", indent: 1, italic: true },
    { text: "D-3, D-2", indent: 1, italic: true },
    { text: "", kind: "spacer" },
    { text: "with hydration  D5WNa77K20(NaK2V)", indent: 1, italic: true },
    { text: "(250cc/hr: from -6 hr to +12hr, 75cc/hr in the meantime: furosemide if needed)", indent: 1, italic: true },
    { text: "premed: Dexamethasone 10mg IVS (-30min)", indent: 1, italic: true },
    { text: "Furosemide 20mg IVS (+1 hour)", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    ...stemCellInfusion(),

    { text: "3) Supportive care", kind: "section", italic: true },
    { text: "Fungal prophylaxis: Micafungin 50mg qd IV (D-3 – ANC>1000 for 3 consecutive days)", italic: true },
    { text: "  – 이전에 invasive mold infection이 있었던 경우 감염내과 상의 후 결정", indent: 1, italic: true },
    { text: "Ciprofloxacin 500mg po bid (D-3 – ANC>1000 for 3 consecutive days)", italic: true },
    { text: "CMV prophylaxis: IVIg 500mg/kg iv (D7부터 2주 간격, 3개월까지 격주 500mg/kg, 이후 6개월까지 매월 500mg/kg, 최장 9개월 급여)", italic: true },
    { text: "G-CSF 300ug/m² (or 450 ug) S.Q or MIVs (보험기준상 ANC 3000까지 투여 가능)", italic: true },
    { text: "Vit K 10mg iv weekly", italic: true, checkbox: true, id: "vitk" },
    { text: "", kind: "spacer" },
    { text: "Antiemetics", kind: "sub", italic: true },
    { text: "D-3, -2  Serotonin antagonist IV", indent: 1, italic: true, checkbox: true, id: "ae-hdmel-iv" },
    { text: "D-1, 0  Serotonin antagonist PO (IV와 동일 제제 투여)", indent: 1, italic: true },
    { text: "prn) lorazepam 0.5-2mg IV q4-6h OR metoclopramide 10mg IV q8h or olanzapine[D] 5~10mg po", indent: 1, italic: true },
    { text: "* olanzapine 투여 시 metoclopramide 병용 금기", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "4) Lab F/U", kind: "section", italic: true },
    { text: "1. daily CBC", indent: 1, italic: true },
    { text: "2. Adm batt, e', Mg, Coagulation, U/A (X2/week): daily e'/BUN/Cr (D-3 – D1)", indent: 1, italic: true },
    { text: "3. Chest PA: Weekly", indent: 1, italic: true },
    { text: "4. 1주마다 CMV antigenemia check", indent: 1, italic: true },
  ]
}

/* ------------------------------------------------------------------ *
 * bufluATG — Busulfan/Fludarabine/ATG (MAC)
 * ------------------------------------------------------------------ */
function buildBufluATG(c: CalcResult, dose: Doses): RenderLine[] {
  const busulfanMg = n(dose.busulfan_mg_kg * c.busulfanWeight, 0)
  const fluMg = n(dose.fludarabine_mg_m2 * c.bsa, 0)
  const atgMg = n(dose.atg_mg_kg * c.tbw, 1)
  const mpredMg = n(dose.mpred_mg_kg * c.tbw, 0)
  const mtxD1 = n(dose.mtx_mg_m2 * c.bsa, 1)
  const mtxD36 = n(10 * c.bsa, 1)
  const hyd = n((125 * 24) / 24, 0)

  return [
    { text: "Busulfan/Fludarabine/ATG (MAC); Bu4Flu-ATG", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c),
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section", italic: true },
    {
      checkbox: true,
      id: "busulfan",
      segments: [
        { text: "Busulfan " },
        { text: `${busulfanMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.busulfan_mg_kg)}`, dose: { key: "busulfan_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) miv over 3hrs (하루 1번)" },
      ],
    },
    { text: "N/S 200~500mL [농도범위에 따라 변환가능, 0.5mg/ml 이상]", indent: 1, italic: true },
    { text: "D-6, D-5, D-4, D-3", indent: 1, italic: true },
    { text: "with Sz prophylaxis:", indent: 1, italic: true },
    { text: "Busulfan 투약 3-4시간 전 Levetiracetam 1500mg po loading (D-6)", indent: 2, italic: true, checkbox: true, id: "levetiracetam" },
    { text: "다음날부터 500mg PO bid (D-5 ~ D-2), GFR 30 미만인 경우 250mg bid", indent: 2, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "fludarabine",
      segments: [
        { text: "Fludarabine " },
        { text: `${fluMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.fludarabine_mg_m2)}`, dose: { key: "fludarabine_mg_m2", unit: "mg/m²" } },
        { text: "mg/m²) miv over 1 hour" },
      ],
    },
    { text: "NS 100mL", indent: 1, italic: true },
    { text: "D-6, D-5, D-4, D-3", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "atg",
      segments: [
        { text: "ATG (Rabbit, Thymoglobulin) " },
        { text: `${atgMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.atg_mg_kg)}`, dose: { key: "atg_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) miv over 6 hrs via I-med" },
      ],
    },
    { text: "1.5 mg/kg/day for matched related donors", indent: 1, italic: true },
    { text: "2.5 mg/kg/day for matched unrelated / mismatched related (haplo) donors", indent: 1, italic: true },
    { text: "N/S (final conc. 0.5mg/ml – ATG 용량의 2배 양에 해당하는 희석 수액 처방)", indent: 1, italic: true },
    { text: "D-3, D-2, D-1", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "mpred",
      segments: [
        { text: "Methylprednisolone " },
        { text: `${mpredMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.mpred_mg_kg)}`, dose: { key: "mpred_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) in D5W 100ml IV over 30mins q12hr (daily 2mg/kg)" },
      ],
    },
    { text: "D-3, D-2, D-1", indent: 1, italic: true },
    { text: "※ Premedication for Thymoglobulin", indent: 1, italic: true },
    { text: "1시간 전 Acetaminophen 600mg po, Hydroxyzine 1T po", indent: 2, italic: true },
    { text: "30분 전 Chlorpheniramine 4mg iv (with methylprednisolone as above)", indent: 2, italic: true },
    { text: "ATG 30분 후 Hydrocortisone 50mg iv", indent: 2, italic: true },
    { text: "Shivering 등의 증상 발생 시 prn) Pethidine 25mg IV", indent: 2, italic: true },
    { text: "with hydration D5WNa77K20(NaK2V)", indent: 1, italic: true, annotation: `${hyd} cc/hr` },
    { text: "(125cc/hr: from D-6 to D-3, then tapering) check serum electrolyte, PRN furosemide 1A", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "2) Stem cell infusion (D0, (D1), (D2))", kind: "section", italic: true },
    { text: "At least 48 hours after the completion of chemotherapy", indent: 1, italic: true },
    { text: "Premed (-30 min): Chlorpheniramine 4mg ivs", indent: 1, italic: true },
    { text: "Stem cell infusion: over 5-7 min per bag", indent: 1, italic: true },
    { text: "Check V/S q 30min x4, q 1hr x4", indent: 1, italic: true },
    { text: "Washing infusion tubing with saline", indent: 1, italic: true },
    { text: "Keep at bedside for 1 hour after stem cell infusion", indent: 1, italic: true },
    { text: "Prepare chlorpheniramine 4mg, epinephrine, hydrocortisone and O2 kit at bed side", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "3) Supportive care", kind: "section", italic: true },
    { text: "3-1. Gut decontamination: Ciprofloxacin 500mg po bid (D-6 to ANC > 1,000)", italic: true },
    { text: "3-2. VOD prophylaxis: UDCA 200mg tid PO (D-6 – D+21 혹은 생착 시까지)", italic: true },
    { text: "3-3. PCP prophylaxis: TMP/SMX(SS) 1T po qd (Start at D+21 if ANC>1000) for 6 months", italic: true },
    { text: "3-4. Fungal prophylaxis: Micafungin 50mg qd IV (D-6 – ANC>1000 for 3 consecutive days)", italic: true },
    { text: "3-5. CMV prophylaxis: letermovir 또는 IVIg 500mg/kg iv (조건에 따라)", italic: true },
    { text: "3-6. HSV prophylaxis: acyclovir 400mg PO bid (D-8~D+30)", italic: true },
    { text: "3-7. G-CSF: Filgrastim 300ug/m² (or 450 ug) SQ or MIVs (보험기준상 ANC 3000까지 투여 가능)", italic: true },
    { text: "3-8. Vit K 10mg iv weekly, Ulcer prophylaxis for steroid use: H2 blocker or PPI", italic: true, checkbox: true, id: "vitk" },
    { text: "", kind: "spacer" },
    { text: "3-9. Antiemetics", kind: "sub", italic: true },
    { text: "D-6~D-3  Serotonin antagonist IV [palonosetron 0.25mg, ramo 0.3mg, grani 3mg, ondan 8mg q12hr 중 택1]", indent: 1, italic: true, checkbox: true, id: "ae-batg-iv" },
    { text: "D-2, D-1  Serotonin antagonist PO (IV와 동일 제제 투여)", indent: 1, italic: true },
    { text: "prn) lorazepam 0.5-2mg IV q4-6h OR metoclopramide 10mg IV q8h, olanzapine[D] 5~10mg po", indent: 1, italic: true },
    { text: "※ olanzapine 투여 시 metoclopramide 병용 금기", indent: 1, italic: true },
    { text: "※ regimen상 steroid 투여되면 중복해서 투여하지 않아도 됨", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "4) GVHD prophylaxis", kind: "section", italic: true },
    { text: "★ related donor (matched sibling, haploidentical): CsA + MTX", indent: 1, italic: true },
    { text: "★ unrelated donor (KMDP, JMDP 등): tacrolimus + MTX", indent: 1, italic: true },
    { text: "4-1. Cyclosporin A (related) 3mg/kg civ (D-2) / Tacrolimus (unrelated) 0.04 mg/kg/day IV (D-2)", indent: 1, italic: true },
    {
      indent: 1,
      checkbox: true,
      id: "mtx",
      segments: [
        { text: "4-2. MTX " },
        { text: `${mtxD1} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.mtx_mg_m2)}`, dose: { key: "mtx_mg_m2", unit: "mg/m²" } },
        { text: "mg/m² ivp) (D1) → " },
        { text: `${mtxD36} mg`, red: true },
        { text: " (10mg/m² ivp) (D3, D6)" },
      ],
    },
    { text: "", kind: "spacer" },

    { text: "5) Lab F/U", kind: "section", italic: true },
    { text: "1. Cyclosporin or Tacrolimus level: x3/week, 투약 3일째 level 확인하여 조절", indent: 1, italic: true },
    { text: "2. daily CBC/differential", indent: 1, italic: true },
    { text: "3. Adm batt, e', Mg, Coagulation, U/A (2/week)", indent: 1, italic: true },
    { text: "4. 1주마다 CMV antigenemia check", indent: 1, italic: true },
  ]
}

/* ------------------------------------------------------------------ *
 * Shared blocks
 * ------------------------------------------------------------------ */
function patientSummary(c: CalcResult, showAbw = true): RenderLine[] {
  const lines: RenderLine[] = [
    { segments: [{ text: "Actual Bwt: " }, { text: `${n(c.tbw, 1)} Kg`, red: true }], kind: "sub" },
  ]
  if (showAbw) {
    lines.push({ segments: [{ text: "ABW25: " }, { text: `${n(c.abw25, 1)} Kg`, red: true }], kind: "sub" })
  }
  lines.push({ segments: [{ text: "BSA: " }, { text: `${n(c.bsa, 2)} m²`, red: true }], kind: "sub" })
  return lines
}

function stemCellInfusion(): RenderLine[] {
  return [
    { text: "2) Stem cell infusion", kind: "section", italic: true },
    { text: "At least 48 hrs after the completion of chemotherapy", indent: 1, italic: true },
    { text: "Premed: Chlorpheniramine 4mg (-15 min)", indent: 1, italic: true },
    { text: "Stem cell infusion: over 5-10 min per bag", indent: 1, italic: true },
    { text: "Check V/S q 30min x4, q 1hr x4", indent: 1, italic: true },
    { text: "Washing infusion tubing with saline", indent: 1, italic: true },
    { text: "Keep at bedside for 1 hour after stem cell infusion", indent: 1, italic: true },
    { text: "", kind: "spacer" },
  ]
}

function thioBuCySupportive(gcsfRange: string): RenderLine[] {
  return [
    { text: "3) Supportive care", kind: "section", italic: true },
    { text: "Gut decontamination: Ciprofloxacin 500mg po bid (D-8 to ANC > 1,000)", italic: true },
    { text: "VOD prophylaxis: UDCA 200mg tid PO (D-7 – D+21 혹은 생착 시까지)", italic: true },
    { text: "Fungal prophylaxis: Micafungin 50mg qd IV (D-8 – ANC>1000 for 3 consecutive days)", italic: true },
    { text: "CMV prophylaxis: IVIg 500mg/kg iv (D7부터 2주 간격, 3개월까지 격주 500mg/kg, 이후 6개월까지 매월 500mg/kg, 최장 9개월 급여)", italic: true },
    { text: "G-CSF: Filgrastim 5-10 ug/kg SQ or MIVs (보험기준상 ANC 3000까지 투여 가능)", italic: true, annotation: gcsfRange },
    { text: "Vit K 10mg iv weekly", italic: true, checkbox: true, id: "vitk" },
    { text: "", kind: "spacer" },
  ]
}

function highRiskAntiemetics(): RenderLine[] {
  return [
    { text: "Antiemetics:", kind: "sub", italic: true },
    { text: "D-8  Palonosetron 0.25mg IV + Olanzapine 10mg qd [D]", indent: 1, italic: true, checkbox: true, id: "ae-d8" },
    { text: "D-7~D-6  Olanzapine 10mg qd [D]", indent: 1, italic: true },
    { text: "D-5~D-4  Serotonin antagonist IV", indent: 1, italic: true, checkbox: true, id: "ae-d5" },
    { text: "고위험군 (D-3, D-2)", indent: 1, italic: true },
    { text: "D-3  aprepitant 125mg PO + Serotonin antagonist IV + dexamethasone 12mg iv", indent: 2, italic: true, checkbox: true, id: "ae-hr-d3-apr" },
    { text: "D-2, D-1  aprepitant 80mg PO + dexamethasone 8mg", indent: 2, italic: true, checkbox: true, id: "ae-hr-d2-apr" },
    { text: "or D-3 Fosaprepitant 150mg + Serotonin antagonist + dexamethasone 12mg iv", indent: 2, italic: true },
    { text: "   D-2, D-1 dexamethasone 8mg", indent: 2, italic: true },
    { text: "or D-3 Netupitant 300mg/Palonosetron 0.5mg PO qd + dexamethasone 12mg iv", indent: 2, italic: true },
    { text: "   D-2, D-1 dexamethasone 8mg po or iv qd", indent: 2, italic: true },
    { text: "prn) lorazepam 0.5-2mg IV q4-6h OR metoclopramide 10mg IV q8h or olanzapine[D] 10mg po", indent: 1, italic: true },
    { text: "* olanzapine 투여 시 metoclopramide 병용 금기", indent: 1, italic: true },
    { text: "", kind: "spacer" },
  ]
}

function labFU(): RenderLine[] {
  return [
    { text: "4) Lab F/U", kind: "section", italic: true },
    { text: "1. daily CBC", indent: 1, italic: true },
    { text: "2. Adm batt, e', Mg, Coagulation, U/A (2/week): daily e' B/Cr (D-8 – D0)", indent: 1, italic: true },
    { text: "3. Weekly ECG, CPA", indent: 1, italic: true },
    { text: "4. 1주마다 CMV antigenemia check", indent: 1, italic: true },
  ]
}

const BUILDERS: Record<string, (c: CalcResult, dose: Doses) => RenderLine[]> = {
  thiobucy: buildThioBuCy,
  hdmel: buildHDMEL,
  buflubatg: buildBufluATG,
}

export function buildRegimenLines(
  regimenId: string | null,
  calc: CalcResult,
  overrides: DoseOverrides = {},
): RenderLine[] {
  if (!regimenId) return []
  const builder = BUILDERS[regimenId]
  if (!builder) return []
  const dose = mergeDoseOverrides(regimenId, overrides) as Doses
  return builder(calc, dose)
}
