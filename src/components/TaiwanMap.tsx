import type { MapCountyStatus } from "../lib/presentation";
import { COUNTY_INSET_BORDERS, COUNTY_MAP_VIEWBOX, COUNTY_SHAPES } from "../lib/countyShapes";

const FILL: Record<MapCountyStatus, string> = {
  alarm: "rgb(var(--alarm))",
  advisory: "rgb(var(--advisory))",
  calm: "rgb(var(--calm))",
  unknown: "rgb(var(--unknown))",
};

// Outlying counties sit in insets and are only a few pixels wide; give them a
// tap target that covers their inset frame.
const INSET_LABELS: Record<string, string> = {
  連江縣: "連江",
  金門縣: "金門",
  澎湖縣: "澎湖",
};

export function TaiwanMap({
  statuses,
  selectedCountyName,
  hatched,
  onSelect,
  describe,
}: {
  statuses: Record<string, MapCountyStatus>;
  selectedCountyName: string;
  /** Diagonal hatching marks data that is cached or not yet confirmed. */
  hatched: boolean;
  onSelect: (countyName: string) => void;
  describe: (countyName: string) => string;
}) {
  const selected = COUNTY_SHAPES.find((shape) => shape.countyName === selectedCountyName);

  return (
    <svg viewBox={COUNTY_MAP_VIEWBOX} className="h-full w-full select-none" role="group" aria-label="台灣縣市警特報地圖">
      <defs>
        <pattern id="map-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(var(--surface))" strokeWidth="2.2" strokeOpacity="0.75" />
        </pattern>
      </defs>

      <path d={COUNTY_INSET_BORDERS} fill="none" stroke="rgb(var(--line))" strokeWidth="1" strokeDasharray="3 3" />
      {COUNTY_SHAPES.filter((shape) => INSET_LABELS[shape.countyName]).map((shape) => (
        <text key={shape.countyName} x={shape.bounds[0]} y={shape.bounds[1] - 6} className="fill-muted text-xs font-bold">
          {INSET_LABELS[shape.countyName]}
        </text>
      ))}

      {COUNTY_SHAPES.map((shape) => {
        const status = statuses[shape.countyName] ?? "unknown";
        const isInset = Boolean(INSET_LABELS[shape.countyName]);
        const [x0, y0, x1, y1] = shape.bounds;
        return (
          <g
            key={shape.countyName}
            className="cursor-pointer [&:hover_.county-shape]:opacity-80"
            onClick={() => onSelect(shape.countyName)}
          >
            <title>{describe(shape.countyName)}</title>
            {isInset ? <rect x={x0 - 6} y={y0 - 4} width={x1 - x0 + 12} height={y1 - y0 + 8} fill="transparent" /> : null}
            <path
              d={shape.d}
              className="county-shape"
              fill={FILL[status]}
              stroke="rgb(var(--rule))"
              strokeWidth={isInset ? 0.4 : 0.6}
              strokeLinejoin="round"
            />
            {hatched ? <path d={shape.d} fill="url(#map-hatch)" pointerEvents="none" /> : null}
          </g>
        );
      })}

      {selected ? (
        <path
          d={selected.d}
          fill="none"
          stroke="rgb(var(--ink))"
          strokeWidth="2.4"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      ) : null}
    </svg>
  );
}
