import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CWA_ENDPOINTS, type CwaSourceKey } from "../src/lib/cwaAdapter";

interface CachedSource {
  key: CwaSourceKey;
  id: string;
  label: string;
  url: string;
  status: "success" | "error";
  error?: string;
}

const outputPath = resolve("public/data/latest.json");

async function main() {
  const entries = Object.entries(CWA_ENDPOINTS) as Array<[CwaSourceKey, (typeof CWA_ENDPOINTS)[CwaSourceKey]]>;
  const results = await Promise.all(
    entries.map(async ([key, endpoint]) => {
      try {
        const response = await fetch(endpoint.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return {
          key,
          payload: await response.json(),
          source: {
            key,
            id: endpoint.id,
            label: endpoint.label,
            url: endpoint.url,
            status: "success" as const,
          },
        };
      } catch (error) {
        return {
          key,
          payload: null,
          source: {
            key,
            id: endpoint.id,
            label: endpoint.label,
            url: endpoint.url,
            status: "error" as const,
            error: error instanceof Error ? error.message : "Unknown fetch error",
          },
        };
      }
    }),
  );

  const successful = results.filter((result) => result.source.status === "success");
  if (successful.length === 0) {
    throw new Error("All CWA sources failed; refusing to write an empty cache.");
  }

  const payloadFor = (key: CwaSourceKey) => results.find((result) => result.key === key)?.payload ?? null;
  const sources: CachedSource[] = results.map((result) => result.source);

  const cache = {
    generatedAt: new Date().toISOString(),
    sources,
    payloads: {
      generatedAt: new Date().toISOString(),
      warningPayload: payloadFor("warnings"),
      rainfallPayload: payloadFor("rainfall"),
      weatherPayload: payloadFor("weather"),
      earthquakePayload: payloadFor("earthquake"),
      typhoonPayload: payloadFor("typhoon"),
    },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(cache)}\n`, "utf8");
  console.log(`Wrote ${outputPath} with ${successful.length}/${results.length} successful CWA sources.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
