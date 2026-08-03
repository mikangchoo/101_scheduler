import type { RenderLine } from "@/lib/regimen-render"

/** Shared antiemetic block (ThioBuCy, BuFlu variants) */
export function sharedAntiemetics(): RenderLine[] {
  return [
    { text: "Antiemetics:", kind: "sub", italic: true },
    { text: "D-8  Palonosetron 0.25mg IV + Olanzapine 10mg qd [D]", indent: 1, italic: true, checkbox: true, id: "ae-d8" },
    { text: "D-7~D-6  Olanzapine 10mg qd [D]", indent: 1, italic: true },
    { text: "D-5~D-4  Serotonin antagonist IV", indent: 1, italic: true, checkbox: true, id: "ae-d5" },
    { text: "고위험군 (D-3, D-2)", indent: 1, italic: true },
    {
      text: "D-3  aprepitant 125mg PO + Serotonin antagonist IV + dexamethasone 12mg iv",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "ae-hr-d3-apr",
    },
    {
      text: "D-2, D-1  aprepitant 80mg PO + dexamethasone 8mg",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "ae-hr-d2-apr",
    },
    {
      text: "or D-3 Fosaprepitant 150mg + Serotonin antagonist + dexamethasone 12mg iv",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "ae-hr-d3-fos",
    },
    { text: "   D-2, D-1 dexamethasone 8mg", indent: 2, italic: true },
    {
      text: "or D-3 Netupitant 300mg/Palonosetron 0.5mg PO qd + dexamethasone 12mg iv",
      indent: 2,
      italic: true,
      checkbox: true,
      id: "ae-hr-d3-net",
    },
    { text: "   D-2, D-1 dexamethasone 8mg po or iv qd", indent: 2, italic: true },
    {
      text: "prn) lorazepam 0.5-2mg IV q4-6h OR metoclopramide 10mg IV q8h or olanzapine[D] 10mg po",
      indent: 1,
      italic: true,
    },
    { text: "* olanzapine 투여 시 metoclopramide 병용 금기", indent: 1, italic: true },
    { text: "", kind: "spacer" },
  ]
}

/** Shared lab follow-up */
export function sharedLabFU(): RenderLine[] {
  return [
    { text: "4) Lab F/U", kind: "section", italic: true },
    { text: "1. daily CBC", indent: 1, italic: true },
    { text: "2. Adm batt, e', Mg, Coagulation, U/A (2/week): daily e' B/Cr (D-8 – D0)", indent: 1, italic: true },
    { text: "3. Weekly ECG, CPA", indent: 1, italic: true },
    { text: "4. 1주마다 CMV antigenemia check", indent: 1, italic: true },
  ]
}

/** ThioBuCy supportive care block */
export function thioBuCySupportive(gcsfRange?: string): RenderLine[] {
  return [
    { text: "3) Supportive care", kind: "section", italic: true },
    { text: "Gut decontamination: Ciprofloxacin 500mg po bid (D-8 to ANC > 1,000)", italic: true },
    { text: "VOD prophylaxis: UDCA 200mg tid PO (D-7 – D+21 혹은 생착 시까지)", italic: true },
    {
      text: "Fungal prophylaxis: Micafungin 50mg qd IV (D-8 – ANC>1000 for 3 consecutive days)",
      italic: true,
    },
    {
      text: "CMV prophylaxis: IVIg 500mg/kg iv (D7부터 2주 간격, 3개월까지 격주 500mg/kg, 이후 6개월까지 매월 500mg/kg, 최장 9개월 급여)",
      italic: true,
    },
    {
      text: "G-CSF: Filgrastim 5-10 ug/kg SQ or MIVs (보험기준상 ANC 3000까지 투여 가능)",
      italic: true,
    },
    { text: "Vit K 10mg iv weekly", italic: true, checkbox: true, id: "vitk" },
    { text: "", kind: "spacer" },
    ...sharedAntiemetics(),
    ...sharedLabFU(),
  ]
}

/** Stem cell infusion block */
export function sharedStemCellInfusion(): RenderLine[] {
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
