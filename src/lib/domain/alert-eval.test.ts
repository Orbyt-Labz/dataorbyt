import { describe, expect, it } from "vitest";
import { decide, evaluateCondition } from "./alert-eval";

describe("evaluateCondition", () => {
  it("threshold", () => {
    expect(evaluateCondition({ kind: "threshold", operator: "lt", value: 0.35 }, { current: 0.3, unit: "percent" }).breach).toBe(true);
    expect(evaluateCondition({ kind: "threshold", operator: "lt", value: 0.35 }, { current: 0.4, unit: "percent" }).breach).toBe(false);
    expect(evaluateCondition({ kind: "threshold", operator: "gt", value: 1 }, { current: null }).insufficientData).toBe(true);
  });

  it("relative change respects direction", () => {
    const drop = { kind: "relative_change", direction: "decrease", pct: 20, comparedTo: "previous_period" } as const;
    expect(evaluateCondition(drop, { current: 70, baseline: 100 }).breach).toBe(true);
    expect(evaluateCondition(drop, { current: 130, baseline: 100 }).breach).toBe(false);
    expect(evaluateCondition({ ...drop, direction: "either" }, { current: 130, baseline: 100 }).breach).toBe(true);
    expect(evaluateCondition(drop, { current: 70, baseline: 0 }).insufficientData).toBe(true);
  });

  it("freshness, missing data and pipeline failures", () => {
    expect(evaluateCondition({ kind: "freshness_sla", maxAgeHours: 6 }, { freshnessHours: 8 }).breach).toBe(true);
    expect(evaluateCondition({ kind: "missing_data", expectedRowsAtLeast: 1 }, { rowCount: 0 }).breach).toBe(true);
    expect(evaluateCondition({ kind: "pipeline_failure", target: "dbt_test" }, { pipelineFailed: false }).breach).toBe(false);
  });
});

describe("decide (anti-noise)", () => {
  const now = new Date("2026-05-01T12:00:00Z");
  const base = { status: "active" as const, cooldownMinutes: 60, consecutiveEvaluations: 2 };

  it("requires consecutive breaches", () => {
    expect(decide(base, [false, true], now)).toBe("pending");
    expect(decide(base, [true, true], now)).toBe("fire");
    expect(decide(base, [true, false], now)).toBe("ok");
  });

  it("applies cooldown and snooze", () => {
    expect(decide({ ...base, lastTriggeredAt: "2026-05-01T11:30:00Z" }, [true, true], now)).toBe("suppressed_cooldown");
    expect(decide({ ...base, lastTriggeredAt: "2026-05-01T10:00:00Z" }, [true, true], now)).toBe("fire");
    expect(decide({ ...base, snoozedUntil: "2026-05-02T00:00:00Z" }, [true, true], now)).toBe("suppressed_snoozed");
  });

  it("never fires when paused", () => {
    expect(decide({ ...base, status: "paused" }, [true, true], now)).toBe("paused");
  });
});
