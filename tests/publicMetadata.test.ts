// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PUBLIC_URL = "https://livejiaquan.github.io/taiwan-weather-risk-dashboard/";

function readOptional(path: string) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  }
}

describe("public discovery metadata", () => {
  it("publishes one canonical URL across HTML, robots, and sitemap", () => {
    const html = readFileSync("index.html", "utf8");
    const robots = readOptional("public/robots.txt");
    const sitemap = readOptional("public/sitemap.xml");

    expect(html).toContain(`<link rel="canonical" href="${PUBLIC_URL}" />`);
    expect(html).toContain(`<meta property="og:url" content="${PUBLIC_URL}" />`);
    expect(robots).toContain(`Sitemap: ${PUBLIC_URL}sitemap.xml`);
    expect(sitemap).toContain(`<loc>${PUBLIC_URL}</loc>`);
  });
});
