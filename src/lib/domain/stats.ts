/**
 * Two-arm experiment analysis for binary (conversion) outcomes.
 *
 * Method
 * - Outcome: conversions / exposed subjects per variant (analysis on exposed units).
 * - Effect: absolute difference p_t − p_c and relative lift (p_t − p_c) / p_c.
 * - 95% CI: Wald interval on the difference with unpooled standard error.
 * - p-value: two-sided two-proportion z-test with pooled standard error.
 * - Sample-ratio mismatch (SRM): chi-square goodness-of-fit (1 df) of assigned
 *   counts against planned allocation; p < 0.001 marks the experiment invalid.
 *
 * Assumptions: independent units, randomisation at the analysis unit, a fixed
 * horizon (no optional stopping), and large-sample normality. Inference is
 * withheld — results become descriptive only — when any precondition fails.
 */

import type { Experiment } from "./types";

/** Complementary error function (Abramowitz & Stegun 7.1.26, |ε| < 1.5e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const r = poly * Math.exp(-z * z);
  return x >= 0 ? r : 2 - r;
}

export function normalTwoSidedP(z: number) {
  return erfc(Math.abs(z) / Math.SQRT2);
}

/** Chi-square goodness of fit for two arms (df = 1). */
export function srmCheck(assigned: [number, number], allocation: [number, number]) {
  const total = assigned[0] + assigned[1];
  const share = allocation[0] / (allocation[0] + allocation[1]);
  const expected = [total * share, total * (1 - share)];
  const chi2 = expected.reduce((acc, e, i) => acc + (e > 0 ? (assigned[i] - e) ** 2 / e : 0), 0);
  // For df = 1, P(X > chi2) = erfc(sqrt(chi2 / 2)).
  const pValue = erfc(Math.sqrt(chi2 / 2));
  return { chi2, pValue, mismatch: pValue < 0.001, expected };
}

export function twoProportion(cControl: number, nControl: number, cTreat: number, nTreat: number, alpha = 0.05) {
  const p1 = cControl / nControl;
  const p2 = cTreat / nTreat;
  const diff = p2 - p1;
  const seUnpooled = Math.sqrt((p1 * (1 - p1)) / nControl + (p2 * (1 - p2)) / nTreat);
  const zCrit = alpha === 0.05 ? 1.959964 : alpha === 0.01 ? 2.575829 : 1.644854;
  const pooled = (cControl + cTreat) / (nControl + nTreat);
  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / nControl + 1 / nTreat));
  const z = sePooled > 0 ? diff / sePooled : 0;
  return {
    pControl: p1,
    pTreatment: p2,
    diff,
    relativeLift: p1 > 0 ? diff / p1 : null,
    ci: [diff - zCrit * seUnpooled, diff + zCrit * seUnpooled] as [number, number],
    z,
    pValue: normalTwoSidedP(z),
  };
}

export const INFERENCE_RULES = {
  minExposedPerArm: 100,
  minEventsPerArm: 10,
  srmAlpha: 0.001,
  alpha: 0.05,
};

export type InferenceStatus =
  | { available: true }
  | { available: false; reason: string; code: "not_two_arms" | "no_data" | "srm" | "small_sample" | "peeking" | "draft" };

export interface ExperimentAnalysis {
  status: InferenceStatus;
  variants: { key: string; name: string; isControl: boolean; allocation: number; assigned: number; exposed: number; conversions: number; rate: number | null }[];
  srm: ReturnType<typeof srmCheck> | null;
  effect: ReturnType<typeof twoProportion> | null;
  significant: boolean | null;
  guardrails: { metricKey: string; control: number; treatment: number; deltaPct: number; breached: boolean; harmfulDirection: "lower" | "higher"; tolerancePct: number }[];
  progress: number | null;
}

export function analyzeExperiment(exp: Experiment): ExperimentAnalysis {
  const variants = exp.variants.map((v) => {
    const o = exp.observations.find((x) => x.variant === v.key);
    return {
      key: v.key,
      name: v.name,
      isControl: v.isControl,
      allocation: v.allocation,
      assigned: o?.assigned ?? 0,
      exposed: o?.exposed ?? 0,
      conversions: o?.conversions ?? 0,
      rate: o && o.exposed > 0 ? o.conversions / o.exposed : null,
    };
  });

  const control = variants.find((v) => v.isControl);
  const treatment = variants.find((v) => !v.isControl);
  const guardrails = exp.guardrails.map((g) => {
    const c = g.byVariant.find((x) => x.variant === control?.key)?.value ?? 0;
    const t = g.byVariant.find((x) => x.variant === treatment?.key)?.value ?? 0;
    const deltaPct = c !== 0 ? ((t - c) / Math.abs(c)) * 100 : 0;
    const breached = g.harmfulDirection === "lower" ? deltaPct < -g.tolerancePct : deltaPct > g.tolerancePct;
    return { metricKey: g.metricKey, control: c, treatment: t, deltaPct, breached, harmfulDirection: g.harmfulDirection, tolerancePct: g.tolerancePct };
  });
  const minExposed = Math.min(...variants.map((v) => v.exposed));
  const progress = exp.targetSampleSizePerVariant ? Math.min(1, minExposed / exp.targetSampleSizePerVariant) : null;

  const base = { variants, guardrails, progress };
  const unavailable = (code: Extract<InferenceStatus, { available: false }>["code"], reason: string, srm: ExperimentAnalysis["srm"] = null): ExperimentAnalysis => ({
    ...base,
    status: { available: false, code, reason },
    srm,
    effect: null,
    significant: null,
  });

  if (exp.status === "draft") return unavailable("draft", "Experiment has not started.");
  if (variants.length !== 2 || !control || !treatment) return unavailable("not_two_arms", "Inference is implemented for two-arm experiments only.");
  if (variants.every((v) => v.assigned === 0)) return unavailable("no_data", "No assignments recorded yet.");

  const srm = srmCheck([control.assigned, treatment.assigned], [control.allocation, treatment.allocation]);
  if (srm.mismatch) {
    return unavailable("srm", `Sample-ratio mismatch detected (χ² = ${srm.chi2.toFixed(1)}, p = ${srm.pValue.toExponential(1)}). Assignment is likely broken; results are not trustworthy.`, srm);
  }
  const small = [control, treatment].some(
    (v) => v.exposed < INFERENCE_RULES.minExposedPerArm || v.conversions < INFERENCE_RULES.minEventsPerArm || v.exposed - v.conversions < INFERENCE_RULES.minEventsPerArm,
  );
  if (small) return unavailable("small_sample", `Each arm needs ≥ ${INFERENCE_RULES.minExposedPerArm} exposed units and ≥ ${INFERENCE_RULES.minEventsPerArm} conversions and non-conversions.`, srm);
  if (exp.status === "running" && exp.targetSampleSizePerVariant && minExposed < exp.targetSampleSizePerVariant) {
    return unavailable("peeking", `Planned sample not reached (${minExposed.toLocaleString()} of ${exp.targetSampleSizePerVariant.toLocaleString()} per arm). Inference is withheld to avoid peeking at a fixed-horizon test.`, srm);
  }

  const effect = twoProportion(control.conversions, control.exposed, treatment.conversions, treatment.exposed, INFERENCE_RULES.alpha);
  return { ...base, status: { available: true }, srm, effect, significant: effect.pValue < INFERENCE_RULES.alpha };
}

/** Approximate per-arm sample size for a two-proportion test (α = 0.05 two-sided, power = 0.8). */
export function requiredSampleSize(baselineRate: number, mdeRelative: number) {
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + mdeRelative);
  const zA = 1.959964;
  const zB = 0.841621;
  const pBar = (p1 + p2) / 2;
  const n = (zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p2 - p1) ** 2;
  return Math.ceil(n);
}
