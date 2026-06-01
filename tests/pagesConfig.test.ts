// @vitest-environment node

import { describe, expect, it } from "vitest";
import viteConfig from "../vite.config";

describe("GitHub Pages Vite config", () => {
  it("builds assets under the repository project path", () => {
    expect(viteConfig.base).toBe("/taiwan-weather-risk-dashboard/");
  });
});
