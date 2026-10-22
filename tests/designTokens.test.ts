// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");

function tokens(selector: string): Record<string, number[]> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing ${selector} block`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(\d+) (\d+) (\d+);/g)].map((match) => [match[1], match.slice(2, 5).map(Number)]),
  );
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// Text/background pairs actually used in the UI (WCAG AA 4.5:1 for body text).
const TEXT_PAIRS = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink", "raised"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "raised"],
  ["muted", "accent-soft"],
  ["accent", "surface"],
  ["accent", "bg"],
  ["accent", "accent-soft"],
  ["accent-ink", "accent"],
  ["alarm-ink", "alarm-soft"],
  ["alarm-ink", "surface"],
  ["advisory-ink", "advisory-soft"],
  ["advisory-ink", "surface"],
  ["calm-ink", "raised"],
  ["unknown-ink", "raised"],
] as const;

// Map fills are essential graphics (WCAG 1.4.11, 3:1) against the map background.
// "unknown" is exempt because it is always drawn with a hatch pattern.
const MAP_FILLS = ["alarm", "advisory", "calm"] as const;

describe.each([
  ["light", ":root"],
  ["dark", ":root.dark"],
])("%s theme tokens", (_, selector) => {
  const theme = tokens(selector);

  it.each(TEXT_PAIRS)("%s on %s meets 4.5:1", (foreground, background) => {
    expect(contrast(theme[foreground], theme[background])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(MAP_FILLS)("map fill %s meets 3:1 against the sea", (fill) => {
    expect(contrast(theme[fill], theme.sea)).toBeGreaterThanOrEqual(3);
  });
});
