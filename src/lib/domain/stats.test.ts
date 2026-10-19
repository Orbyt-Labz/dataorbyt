import { describe, expect, it } from "vitest";
import type { Experiment } from "./types";
import { analyzeExperiment, erfc, requiredSampleSize, srmCheck, twoProportion } from "./stats";

const base: Experiment = {
  id: "e",
  projectId: "p",
  key: "k",
  name: "n",
  hypothesis: "h".repeat(30),
  population: "all",
  randomizationUnit: "user",
  variants: [
    { key: "control", name: "C", allocation: 50, isControl: true },
    { key: "t", name: "T", allocation: 50, isControl: false },
  ],
  startDate: "2026-01-01",
  endDate: "2026-02-01",
  primaryMetric: "m",
  guardrailMetrics: [],
  status: "completed",
  owner: "o",
  observations: [],
  guardrails: [],
  relatedDashboardIds: [],
  createdAt: "",
  createdVia: "seed",
};

describe("erfc", () => {
  it("matches known values", () => {
    expect(erfc(0)).toBeCloseTo(1, 6);
    expect(erfc(1)).toBeCloseTo(0.157299, 5);
    expect(erfc(-1)).toBeCloseTo(1.842701, 5);
  });
});

describe("twoProportion", () => {
  it("computes difference, CI and a two-sided p-value", () => {
    const r = twoProportion(457, 2540, 541, 2522);
    expect(r.pControl).toBeCloseTo(0.1799, 3);
    expect(r.pTreatment).toBeCloseTo(0.2145, 3);
    expect(r.ci[0]).toBeLessThan(r.diff);
    expect(r.ci[1]).toBeGreaterThan(r.diff);
    expect(r.ci[0]).toBeGreaterThan(0); // significant positive effect
    expect(r.pValue).toBeLessThan(0.01);
  });

  it("returns a large p-value for no effect", () => {
    const r = twoProportion(100, 1000, 101, 1000);
    expect(r.pValue).toBeGreaterThan(0.9);
    expect(r.ci[0]).toBeLessThan(0);
    expect(r.ci[1]).toBeGreaterThan(0);
  });
});

describe("srmCheck", () => {
  it("passes for balanced assignment", () => {
    expect(srmCheck([5000, 4980], [50, 50]).mismatch).toBe(false);
  });
  it("flags a sample-ratio mismatch", () => {
    const r = srmCheck([1984, 1631], [50, 50]);
    expect(r.mismatch).toBe(true);
    expect(r.pValue).toBeLessThan(0.001);
  });
});

describe("analyzeExperiment", () => {
  it("computes inference when preconditions hold", () => {
    const a = analyzeExperiment({
      ...base,
      observations: [
        { variant: "control", assigned: 2611, exposed: 2540, conversions: 457 },
        { variant: "t", assigned: 2589, exposed: 2522, conversions: 541 },
      ],
    });
    expect(a.status.available).toBe(true);
    expect(a.significant).toBe(true);
  });

  it("withholds inference on SRM", () => {
    const a = analyzeExperiment({
      ...base,
      observations: [
        { variant: "control", assigned: 1984, exposed: 1902, conversions: 301 },
        { variant: "t", assigned: 1631, exposed: 1570, conversions: 288 },
      ],
    });
    expect(a.status).toMatchObject({ available: false, code: "srm" });
    expect(a.effect).toBeNull();
    expect(a.significant).toBeNull();
  });

  it("withholds inference for small samples", () => {
    const a = analyzeExperiment({
      ...base,
      observations: [
        { variant: "control", assigned: 60, exposed: 50, conversions: 5 },
        { variant: "t", assigned: 60, exposed: 52, conversions: 9 },
      ],
    });
    expect(a.status).toMatchObject({ available: false, code: "small_sample" });
  });

  it("withholds inference while a running test is below its planned sample (no peeking)", () => {
    const a = analyzeExperiment({
      ...base,
      status: "running",
      targetSampleSizePerVariant: 3000,
      observations: [
        { variant: "control", assigned: 1000, exposed: 950, conversions: 150 },
        { variant: "t", assigned: 1000, exposed: 960, conversions: 190 },
      ],
    });
    expect(a.status).toMatchObject({ available: false, code: "peeking" });
  });

  it("flags breached guardrails", () => {
    const a = analyzeExperiment({
      ...base,
      observations: [
        { variant: "control", assigned: 2000, exposed: 2000, conversions: 300 },
        { variant: "t", assigned: 2000, exposed: 2000, conversions: 320 },
      ],
      guardrails: [{ metricKey: "churn", byVariant: [{ variant: "control", value: 0.01 }, { variant: "t", value: 0.013 }], harmfulDirection: "higher", tolerancePct: 10 }],
    });
    expect(a.guardrails[0].breached).toBe(true);
  });
});

describe("requiredSampleSize", () => {
  it("matches the closed-form estimate for 18% baseline / 15% relative MDE (~3,360 per arm)", () => {
    const n = requiredSampleSize(0.18, 0.15);
    expect(n).toBeGreaterThan(3300);
    expect(n).toBeLessThan(3420);
  });
});
