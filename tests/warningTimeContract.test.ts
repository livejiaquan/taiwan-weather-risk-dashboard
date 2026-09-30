import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeWarningData } from "../src/lib/riskEngine";
import { validateWarningPayload } from "../src/lib/warningPayloadValidator";

// A historical official capture is a schema fixture only, never a live fallback.
const fixture = JSON.parse(readFileSync(new globalThis.URL("../public/data/latest.json", import.meta.url), "utf8")).payloads.warningPayload;

describe("official captured warning time contract", () => {
  it("accepts the checked-in CWA county feed and its explicit offset/start/end windows", () => {
    expect(() => validateWarningPayload(fixture)).not.toThrow();
    const warnings = normalizeWarningData(fixture);
    expect(warnings.length).toBeGreaterThan(0);
    for (const warning of warnings) {
      expect(warning.startTime).toMatch(/[+-]\d{2}:\d{2}$/);
      expect(warning.endTime).toMatch(/[+-]\d{2}:\d{2}$/);
    }
  });

  it.each(["startTime", "endTime"])("continues rejecting missing %s at ingestion rather than silently showing no alerts", (field) => {
    const missing = globalThis.structuredClone(fixture);
    const county = missing.cwaopendata.dataset.location.find((location: { hazardConditions?: unknown }) => location.hazardConditions);
    const hazards = county.hazardConditions.hazards;
    const hazard = Array.isArray(hazards) ? hazards[0] : hazards;
    delete hazard.validTime[field];
    expect(() => validateWarningPayload(missing)).toThrow(/requires parseable startTime and endTime/);
  });
});
