// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import viteConfig from "../vite.config";

describe("GitHub Pages Vite config", () => {
  it("builds assets under the repository project path", () => {
    expect(viteConfig.base).toBe("/taiwan-weather-risk-dashboard/");
  });
});

describe("GitHub Pages workflow", () => {
  it("enables Pages before uploading the deployment artifact", () => {
    const workflow = readFileSync(".github/workflows/pages.yml", "utf8");

    expect(workflow).toMatch(/uses:\s+actions\/configure-pages@v6/);
    expect(workflow).toMatch(/enablement:\s+true/);
  });
});
