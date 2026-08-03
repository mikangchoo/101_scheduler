import type { CalcResult } from "@/lib/calc"
import { round } from "@/lib/calc"
import { type DoseKey, type DoseOverrides, mergeDoseOverrides } from "@/lib/dose-overrides"
import { getBusulfanFluidVolume } from "@/lib/busulfan-fluid"

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

/**
 * 환자 요약(Actual Bwt / ABW25 / BSA) 표기용 포맷.
 * 소수점 둘째 자리까지 표시하되, 둘째 자리가 0이면 첫째 자리까지만 표시.
 * 62.45 → "62.45" / 62.4 → "62.4" / 62 → "62.0"
 */
export function formatPatientNumber(v: number): string {
  const r = round(v, 2)
  const twoDecimals = Math.round(r * 100) % 10 !== 0
  return r.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: twoDecimals ? 2 : 1,
  })
}

/** number formatting for dose tokens (drop trailing zeros) */
function d(v: number): string {
  return String(round(v, 2))
}

type Doses = Record<DoseKey, number>

/* ------------------------------------------------------------------ *
 * 모든 레지멘 공통 문구 (레지멘마다 반드시 존재해야 하는 라인)
 * ------------------------------------------------------------------ */

/** G-CSF 공통 문구 — 모든 레지멘 동일 표기 + 좌측 체크박스 */
const GCSF_TEXT = "G-CSF 300ug/m² (or 450 ug) S.Q or MIVs (보험기준상 ANC 3000까지 투여 가능)"

function gcsfLine(prefix = ""): RenderLine {
  return { text: `${prefix}${GCSF_TEXT}`, italic: true, checkbox: true, id: "gcsf" }
}

/**
 * Vit K + Ulcer prophylaxis — 원본과 동일하게 한 줄 유지.
 * 좌측 체크박스는 Vit K용, 문장 끝(H2 blocker or PPI) 체크박스는 regimen-adjust에서 부여.
 */
function vitKLine(prefix = ""): RenderLine {
  return {
    text: `${prefix}Vit K 10mg iv weekly, Ulcer prophylaxis for steroid use: H2 blocker or PPI`,
    italic: true,
    checkbox: true,
    id: "vitk",
  }
}

/** Stem cell infusion premed — 모든 레지멘 공통, 좌측 체크박스 */
function premedChlorpheniramineLine(): RenderLine {
  return {
    text: "Premed (-30 min): Chlorpheniramine 4mg ivs",
    indent: 1,
    italic: true,
    checkbox: true,
    id: "premed-cpm",
  }
}

/* ------------------------------------------------------------------ *
 * Busulfan 희석 수액량 라인 (엑셀 표 기반, 계산값은 빨간 글씨)
 * ------------------------------------------------------------------ */
function busulfanFluidLine(busulfanMg: number, note: string): RenderLine {
  const vol = getBusulfanFluidVolume(busulfanMg)
  return {
    indent: 1,
    italic: true,
    segments: [
      { text: "N/S " },
      { text: vol == null ? "200~500mL" : `${vol}mL`, red: true },
      { text: ` ${note}` },
    ],
  }
}

/* ------------------------------------------------------------------ *
 * ThioBuCy
 * ------------------------------------------------------------------ */
function buildThioBuCy(c: CalcResult, dose: Doses): RenderLine[] {
  const busulfanMgNum = dose.busulfan_mg_kg * c.busulfanWeight
  const thiotepaMg = n(dose.thiotepa_mg_m2 * c.bsa, 1)
  const busulfanMg = n(busulfanMgNum, 0)
  const cycloMg = n(dose.cyclo_mg_kg * c.tbw, 0)
  const hyd3 = n((3000 * c.bsa) / 24, 0)
  const hyd15 = n((1500 * c.bsa) / 24, 0)
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
    busulfanFluidLine(busulfanMgNum, "[농도범위에 따라 변환가능, 0.5mg/ml 이상, 0.5mg/mL에 근접할 때 가장 안정]"),
    { text: "D-5, D-4", indent: 1, italic: true },
    { text: "with Sz prophylaxis:", indent: 1, italic: true },
    {
      text: "Busulfan 투약 3-4시간 전 Levetiracetam 1500mg po loading (D-5)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "levetiracetam",
    },
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
    {
      text: "1.5L/m²/day, D1 – D4, then tapering, check serum electrolyte",
      indent: 2,
      italic: true,
      annotation: `${hyd15} cc/hr`,
      checkbox: true,
      id: "tbc-hyd15",
    },
    { text: "Furosemide 10mg (D-3 – D0, 이후 PRN)", indent: 2, italic: true },
    {
      text: "check urine output q 6 hr, if 6hr u/o < 1L or 150ml/hr, furosemide 1A ivs",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "tbc-uo",
    },
    { text: "ECG monitor & CK/LD level (D-3 – D1)", indent: 2, italic: true },
    { text: "", kind: "spacer" },

    ...stemCellInfusion(),
    ...thioBuCySupportive(),
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
    {
      text: "(250cc/hr: from -6 hr to +12hr, 75cc/hr in the meantime: furosemide if needed)",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "hdmel-hyd",
    },
    {
      text: "premed: Dexamethasone 10mg IVS (-30min)",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "hdmel-premed-dexa",
    },
    { text: "Furosemide 20mg IVS (+1 hour)", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    ...stemCellInfusion(),

    { text: "3) Supportive care", kind: "section", italic: true },
    { text: "Fungal prophylaxis: Micafungin 50mg qd IV (D-3 – ANC>1000 for 3 consecutive days)", italic: true },
    { text: "  – 이전에 invasive mold infection이 있었던 경우 감염내과 상의 후 결정", indent: 1, italic: true },
    { text: "Ciprofloxacin 500mg po bid (D-3 – ANC>1000 for 3 consecutive days)", italic: true },
    { text: "CMV prophylaxis: IVIg 500mg/kg iv (D7부터 2주 간격, 3개월까지 격주 500mg/kg, 이후 6개월까지 매월 500mg/kg, 최장 9개월 급여)", italic: true },
    gcsfLine(),
    vitKLine(),
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
  const busulfanMgNum = dose.busulfan_mg_kg * c.busulfanWeight
  const busulfanMg = n(busulfanMgNum, 0)
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
    busulfanFluidLine(busulfanMgNum, "[농도범위에 따라 변환가능, 0.5mg/ml 이상, 0.5mg/mL에 근접할 때 가장 안정]"),
    { text: "D-6, D-5, D-4, D-3", indent: 1, italic: true },
    { text: "with Sz prophylaxis:", indent: 1, italic: true },
    {
      text: "Busulfan 투약 3-4시간 전 Levetiracetam 1500mg po loading (D-6)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "levetiracetam",
    },
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
    {
      text: "1시간 전 Acetaminophen 600mg po, Hydroxyzine 1T po",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "atg-premed-1hr",
    },
    {
      text: "30분 전 Chlorpheniramine 4mg iv (with methylprednisolone as above)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "atg-premed-30min",
    },
    {
      text: "ATG 30분 후 Hydrocortisone 50mg iv",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "atg-post-hydrocortisone",
    },
    { text: "Shivering 등의 증상 발생 시 prn) Pethidine 25mg IV", indent: 2, italic: true },
    { text: "with hydration D5WNa77K20(NaK2V)", indent: 1, italic: true, annotation: `${hyd} cc/hr` },
    { text: "(125cc/hr: from D-6 to D-3, then tapering) check serum electrolyte, PRN furosemide 1A", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "2) Stem cell infusion (D0, (D1), (D2))", kind: "section", italic: true },
    { text: "At least 48 hours after the completion of chemotherapy", indent: 1, italic: true },
    premedChlorpheniramineLine(),
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
    { text: "3-5. CMV prophylaxis",
      italic: true,},
    {text: "A. CMV IgG (+) & D0 CMV PCR negative: letermovir D+7~D+100 480mg qd (Cyclosporine 병용 시 240mg qd)",
      italic: true,
      checkbox: true,
      id: "cmv-proph-a",},
    {text: "B. 나머지 경우: IVIg 500mg/kg iv (D+7부터 2주 간격, 3개월까지 격주, 이후 6개월까지 매월, 최장 9개월 급여)",
      italic: true,},
    {text: "C. 고위험군 (혈청음성수혜자 + 혈청양성공여자): ganciclovir 5mg/kg bid IV 1주 → ANC>1000 후 5mg/kg qd till D100",
      italic: true,},
    {text: "※ Cyclosporin + letermovir 사용 시 atorvastatin, simvastatin, pitavastatin, rosuvastatin, dabigatran 병용 금기",
      italic: true,},

    { text: "3-6. HSV prophylaxis: acyclovir 400mg PO bid (D-8~D+30)", italic: true },
    gcsfLine("3-7. "),
    vitKLine("3-8. "),
    { text: "", kind: "spacer" },
    { text: "3-9. Antiemetics", kind: "sub", italic: true },
    {
      text: "D-6~D-3  Serotonin antagonist IV [palonosetron 0.25mg, ramo 0.3mg, grani 3mg, ondan 8mg q12hr 중 택1]",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "ae-batg-iv",
    },
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
 * BuFlu-PTCy — Busulfan/Fludarabine-PTCy Conditioning [MAC]
 * ------------------------------------------------------------------ */
function buildBufluPTCy(c: CalcResult, dose: Doses): RenderLine[] {
  const busulfanMgNum = dose.busulfan_mg_kg * c.busulfanWeight
  const busulfanMg = n(busulfanMgNum, 0)
  const fluMg = n(dose.fludarabine_mg_m2 * c.bsa, 0)
  const condCycloMg = n(dose.conditioning_cyclo_mg_kg * c.tbw, 0)
  const ptcyMg = n(dose.ptcy_mg_kg * c.tbw, 0)
  const mmfMg = n(dose.mmf_mg_kg * c.tbw, 0)
  const hyd3 = n((3000 * c.bsa) / 24, 0)
  const csaMg = n(3 * c.tbw, 1)
  const tacMg = n(0.04 * c.tbw, 2)

  return [
    { text: "Busulfan/Fludarabine-PTCy Conditioning [MAC]", kind: "title" },
    { text: "", kind: "spacer" },
    ...patientSummary(c),
    { text: "", kind: "spacer" },

    { text: "1) Conditioning", kind: "section", italic: true },
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
    { text: "D-7, -6, -5, -4, -3", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "busulfan",
      segments: [
        { text: "Busulfan " },
        { text: `${busulfanMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.busulfan_mg_kg)}`, dose: { key: "busulfan_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) miv over 3hr (하루 1번)" },
      ],
    },
    busulfanFluidLine(busulfanMgNum, "[농도 범위에 따라 변환 가능, 0.5mg/ml 이상, 0.5mg/mL에 근접할 때 가장 안정]"),
    { text: "D-7, -6, -5, -4", indent: 1, italic: true },
    { text: "with Sz prophylaxis:", indent: 1, italic: true },
    {
      text: "Busulfan 투약 3-4시간 전 Levetiracetam 1500mg po loading (D-7)",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "levetiracetam",
    },
    { text: "→ 다음날부터 500mg PO bid (D-6~D-3), GFR 30 미만인 경우 250mg bid", indent: 2, italic: true },
    { text: "", kind: "spacer" },

    {
      checkbox: true,
      id: "conditioning-cyclo",
      annotation: "얼음/EKG",
      segments: [
        { text: "Cyclophosphamide " },
        { text: `${condCycloMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.conditioning_cyclo_mg_kg)}`, dose: { key: "conditioning_cyclo_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) over 1hr" },
      ],
    },
    { text: "D5W 200mL", indent: 1, italic: true },
    { text: "D-3, -2  for 2 days", indent: 1, italic: true },
    { text: "with hydration D5WNa77K20(NaK2V)", indent: 1, italic: true },
    { text: "(NS 125cc/hr: from D-3, D-2, then tapering)", indent: 2, italic: true },
    { text: "", kind: "spacer" },

    { text: "Post-transplant cyclophosphamide", kind: "sub", italic: true },
    {
      checkbox: true,
      id: "ptcy",
      annotation: "얼음/EKG",
      segments: [
        { text: "Cyclophosphamide " },
        { text: `${ptcyMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.ptcy_mg_kg)}`, dose: { key: "ptcy_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) over 1hr" },
      ],
    },
    { text: "D5W 200mL", indent: 1, italic: true },
    { text: "D+3, D+4  for 2 days", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "※ Hemorrhagic cystitis prevention", indent: 1, italic: true },
    { text: "a) Mesna 800mg/NS50ml IVs q 6 hr (Start at -30 min before CTX) D+3, D+4", indent: 2, italic: true },
    { text: "b) Hydration", indent: 2, italic: true },
    { text: "D5WNa77K20(NaK2V) 3L/m²/day, D+3 ~ D+4", indent: 2, italic: true, annotation: `${hyd3} cc/hr` },
    {
      text: "1.5L/day D+5 – D+7, then tapering",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "ptcy-hyd15",
    },
    { text: "Check serum electrolyte and urine output", indent: 2, italic: true },
    { text: "PRN Furosemide 10mg (D+3 ~ D+4, 이후 PRN)", indent: 2, italic: true },
    { text: "ECG monitor & CK/LD level (D+3 ~ D+4)", indent: 2, italic: true },
    { text: "", kind: "spacer" },

    { text: "2) Stem cell infusion (D0, (D1), (D2))", kind: "section", italic: true },
    { text: "At least 48 hours after the completion of chemotherapy", indent: 1, italic: true },
    premedChlorpheniramineLine(),
    { text: "Stem cell infusion: over 15-20 min per bag", indent: 1, italic: true },
    { text: "Check V/S q 30min x4, q 1hr x4", indent: 1, italic: true },
    { text: "Washing infusion tubing with saline", indent: 1, italic: true },
    { text: "Keep at bedside for 1 hour after stem cell infusion", indent: 1, italic: true },
    { text: "Prepare chlorpheniramine 4mg, epinephrine, hydrocortisone and O2 kit at bed side", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "3) GVHD prophylaxis", kind: "section", italic: true },
    { text: "3-1. Post-transplant cyclophosphamide (regimen 참조)", italic: true },
    { text: "※ PTCy D0~D5 사이 steroid 사용하지 않도록 주의", indent: 1, italic: true },
    { text: "3-2. Cyclosporin A or tacrolimus + MMF", italic: true },
    { text: "★ related donor (matched sibling, haploidentical): CsA + MMF", indent: 1, italic: true },
    { text: "★ unrelated donor (KMDP, JMDP 등): tacrolimus + MMF", indent: 1, italic: true },
    {
      indent: 1,
      checkbox: true,
      id: "csa",
      segments: [
        { text: "Cyclosporine A " },
        { text: `${csaMg} mg`, red: true },
        { text: " (3mg/kg) civ: D+5부터 시작" },
      ],
    },
    { text: "이후 혈청 cyclosporin level 보고 therapeutic range 250-400ng/mL로 titration (target range 지정의 확인)", indent: 2, italic: true },
    { text: "경구 섭취 가능 시 IV 용량의 약 2배를 2회 분할(10AM, 10PM) 경구 전환, 경구 시작 3시간 후 IV 중단 (up to day 120~180)", indent: 2, italic: true },
    {
      indent: 1,
      checkbox: true,
      id: "tacrolimus",
      segments: [
        { text: "Tacrolimus " },
        { text: `${tacMg} mg`, red: true },
        { text: " (0.04 mg/kg/day) IV loading: D+5부터 시작" },
      ],
    },
    { text: "Target 5~15ng/mL, 경구 전환 시 IV 용량의 약 3.5배를 2회 분할(10AM, 10PM), 경구투약 전날 10PM IV 중단 (up to day 90~180)", indent: 2, italic: true },
    { text: "5ng/mL 미만: 25% 증량 / 5-15ng/mL: 유지 / 15ng/mL 초과: 6시간 중단 후 25% 감량 / 20ng/mL 초과: 6시간 중단 후 50% 감량", indent: 2, italic: true },
    { text: "* voriconazole 병용 시 PO 전환은 보수적으로 CsA 2배→1.5배, tacrolimus 3.5배→3배 용량으로 시작", indent: 2, italic: true },
    {
      indent: 1,
      checkbox: true,
      id: "mmf",
      segments: [
        { text: "3-3. MMF (Mycophenolate mofetil) " },
        { text: `${mmfMg} mg`, red: true },
        { text: " (" },
        { text: `${d(dose.mmf_mg_kg)}`, dose: { key: "mmf_mg_kg", unit: "mg/kg" } },
        { text: "mg/kg) tid PO, D+5부터 시작 (1cap=250mg, capping 1g tid)" },
      ],
    },
    { text: "PTCy 후 CNI와 병용투여 시 MMF는 D+30~35까지 사용 후 off (up to day 30~100)", indent: 2, italic: true },
    { text: "", kind: "spacer" },

    { text: "4) Supportive care", kind: "section", italic: true },
    { text: "4-1. Gut decontamination: Ciprofloxacin 500mg po bid (D-7 to ANC > 1,000)", italic: true },
    { text: "4-2. VOD prophylaxis: UDCA 200mg tid PO (D-7 – D+21 혹은 생착 시까지)", italic: true },
    { text: "4-3. PCP prophylaxis: TMP/SMX(SS) 1T po qd (Start at D+21 if ANC>1000) for 6 months or until 면역억제제 중단", italic: true },
    { text: "4-4. Fungal prophylaxis: Micafungin 50mg qd IV (D-7 – ANC>1000 for 3 consecutive days)", italic: true },
    { text: "  – 이전에 invasive mold infection이 있었던 경우 감염내과 상의 후 결정", indent: 1, italic: true },
    { text: "4-5. CMV prophylaxis", italic: true },
    { text: "A. CMV IgG (+) & D0 CMV PCR negative: letermovir D+7~D+100 480mg qd (Cyclosporine 병용 시 240mg qd)", indent: 1, italic: true },
    { text: "B. 나머지 경우: IVIg 500mg/kg iv (D+7부터 2주 간격, 3개월까지 격주, 이후 6개월까지 매월, 최장 9개월 급여)", indent: 1, italic: true },
    { text: "C. 고위험군 (혈청음성수혜자 + 혈청양성공여자): ganciclovir 5mg/kg bid IV 1주 → ANC>1000 후 5mg/kg qd till D100", indent: 1, italic: true },
    { text: "※ Cyclosporin + letermovir 사용 시 atorvastatin, simvastatin, pitavastatin, rosuvastatin, dabigatran 병용 금기", indent: 1, italic: true },
    { text: "4-6. HSV prophylaxis: acyclovir 400mg PO bid (D-8~D+30), PO 불가 시 IV 250mg/m² q12h over 1hr", italic: true },
    gcsfLine("4-7. "),
    vitKLine("4-8. "),
    { text: "", kind: "spacer" },
    { text: "4-9. Antiemetics", kind: "sub", italic: true },
    {
      text: "D-7~D-2  Serotonin antagonist IV [palonosetron 0.25mg, ramo 0.3mg, grani 3mg, ondan 8mg q12hr 중 택1]",
      indent: 1,
      italic: true,
      checkbox: true,
      id: "ae-ptcy-iv",
    },
    { text: "D-1~D0  Serotonin antagonist PO (IV와 동일 제제 투여)", indent: 1, italic: true },
    { text: "D+3  Aprepitant 125mg po qd + Serotonin antagonist IV", indent: 1, italic: true },
    { text: "D+4~D+5  Aprepitant 80mg po qd", indent: 1, italic: true },
    { text: "※ antiemetics로도 steroid 사용하지 않습니다.", indent: 1, italic: true },
    { text: "prn) lorazepam 0.5-2mg IV q4-6h OR metoclopramide 10mg IV q8h or olanzapine[D] 5~10mg po", indent: 1, italic: true },
    { text: "※ olanzapine 투여 시 metoclopramide 병용 금기", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "5) Lab F/U", kind: "section", italic: true },
    { text: "1. Cyclosporin or Tacrolimus level (EDTA tube, 약물 들어가지 않는 line): x3/week, 투약 3일째 level 확인하여 조절", indent: 1, italic: true },
    { text: "2. daily CBC/differential", indent: 1, italic: true },
    { text: "3. Adm batt, e', Mg, Coagulation, U/A (2/week): daily e' B/Cr (D-8 – D0)", indent: 1, italic: true },
    { text: "4. Weekly ECG, CPA", indent: 1, italic: true },
    { text: "5. 1주마다 CMV antigenemia check", indent: 1, italic: true },
    { text: "6. ANC < 1000 기간 동안은 weekly aspergillus Ag", indent: 1, italic: true },
    { text: "", kind: "spacer" },

    { text: "6) Donor preparation (PBSCT인 경우)", kind: "section", italic: true },
    { text: "G-CSF 600ug S.Q. qd 9PM D+5부터 start", indent: 1, italic: true },
    { text: "POST-BMT TEST (STR) sampling (D0) (if not done previously)", indent: 1, italic: true },
    { text: "CBC (em) D0, (D1), (D2) 7AM and post-collection", indent: 1, italic: true },
    { text: "iCa++, e'/BUN/Cr x2/day, if Ca++ ↓ → calcium gluconate (in N/S 100mL)", indent: 1, italic: true },
    { text: "Stem cell collection with permission, Target: CD34 > 5x10^6/kg", indent: 1, italic: true },
  ]
}

/* ------------------------------------------------------------------ *
 * Shared blocks
 * ------------------------------------------------------------------ */
function patientSummary(c: CalcResult, showAbw = true): RenderLine[] {
  const lines: RenderLine[] = [
    {
      segments: [{ text: "Actual Bwt: " }, { text: `${formatPatientNumber(c.tbw)} Kg`, red: true }],
      kind: "sub",
    },
  ]
  if (showAbw) {
    lines.push({
      segments: [{ text: "ABW25: " }, { text: `${formatPatientNumber(c.abw25)} Kg`, red: true }],
      kind: "sub",
    })
  }
  lines.push({
    segments: [{ text: "BSA: " }, { text: `${formatPatientNumber(c.bsa)} m²`, red: true }],
    kind: "sub",
  })
  return lines
}

function stemCellInfusion(): RenderLine[] {
  return [
    { text: "2) Stem cell infusion", kind: "section", italic: true },
    { text: "At least 48 hrs after the completion of chemotherapy", indent: 1, italic: true },
    premedChlorpheniramineLine(),
    { text: "Stem cell infusion: over 5-10 min per bag", indent: 1, italic: true },
    { text: "Check V/S q 30min x4, q 1hr x4", indent: 1, italic: true },
    { text: "Washing infusion tubing with saline", indent: 1, italic: true },
    { text: "Keep at bedside for 1 hour after stem cell infusion", indent: 1, italic: true },
    { text: "", kind: "spacer" },
  ]
}

function thioBuCySupportive(): RenderLine[] {
  return [
    { text: "3) Supportive care", kind: "section", italic: true },
    { text: "Gut decontamination: Ciprofloxacin 500mg po bid (D-8 to ANC > 1,000)", italic: true },
    { text: "VOD prophylaxis: UDCA 200mg tid PO (D-7 – D+21 혹은 생착 시까지)", italic: true },
    { text: "Fungal prophylaxis: Micafungin 50mg qd IV (D-8 – ANC>1000 for 3 consecutive days)", italic: true },
    {
      text: "CMV prophylaxis: letermovir 또는 IVIg 500mg/kg iv (조건에 따라)",
      italic: true,
      checkbox: true,
      id: "cmv-proph",
    },
    { text: "  IVIg 500mg/kg iv (D7부터 2주 간격, 3개월까지 격주 500mg/kg, 이후 6개월까지 매월 500mg/kg, 최장 9개월 급여)", indent: 1, italic: true },
    gcsfLine(),
    vitKLine(),
    { text: "", kind: "spacer" },
  ]
}

function highRiskAntiemetics(): RenderLine[] {
  return [
    { text: "Antiemetics:", kind: "sub", italic: true },
    { text: "D-8  Palonosetron 0.25mg IV + Olanzapine 10mg qd [D]", indent: 1, italic: true, checkbox: true, id: "ae-d8" },
    { text: "D-7~D-6  Olanzapine 10mg qd [D]", indent: 1, italic: true, checkbox: true, id: "ae-d7" },
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

/* ------------------------------------------------------------------ *
 * D-day 표기가 포함된 모든 라인에 체크박스 자동 부여
 * ------------------------------------------------------------------ */

/** "D-6, D-5, D-4, D-3" / "D-3, -2  for 2 days" 처럼 날짜만 있는 라벨 라인 */
const DAY_LABEL_ONLY = /^\s*D\s?[+-]?\s?\d+(\s*(,|~|–|-|to|and)\s*(D\s?)?[+-]?\s?\d+)*\s*(for\s+\d+\s+days?)?\s*$/i

/** 본문에 D-day 표기가 포함되어 있는지 */
const HAS_DAY_TOKEN = /D\s?[+-]\s?\d/

function lineText(line: RenderLine): string {
  if (line.segments) return line.segments.map((s) => s.text).join("")
  return line.text ?? ""
}

/**
 * D-/D+ 표기가 들어간 모든 내용 라인 앞에 체크박스를 붙인다.
 * - 이미 checkbox가 지정된 라인은 그대로 유지
 * - 제목/섹션/공백 라인, 날짜만 적힌 라벨 라인은 제외
 */
export function withDayCheckboxes(lines: RenderLine[]): RenderLine[] {
  return lines.map((line, i) => {
    if (line.checkbox) return line
    const kind = line.kind ?? "normal"
    if (kind === "spacer" || kind === "title" || kind === "section") return line

    const text = lineText(line).trim()
    if (!text) return line
    if (!HAS_DAY_TOKEN.test(text)) return line
    if (DAY_LABEL_ONLY.test(text)) return line

    return { ...line, checkbox: true, id: line.id ?? `dayline-${i}` }
  })
}

const BUILDERS: Record<string, (c: CalcResult, dose: Doses) => RenderLine[]> = {
  thiobucy: buildThioBuCy,
  hdmel: buildHDMEL,
  buflubatg: buildBufluATG,
  "buflu-ptcy": buildBufluPTCy,
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
  return withDayCheckboxes(builder(calc, dose))
}
