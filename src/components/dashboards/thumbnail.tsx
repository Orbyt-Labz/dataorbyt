import type { ChartSpec } from "@/lib/domain/types";

const SPAN: Record<ChartSpec["size"], number> = { sm: 3, md: 4, lg: 8, full: 12 };

/** Schematic preview of a dashboard's layout, drawn from its chart specs. */
export function DashboardThumbnail({ charts }: { charts: ChartSpec[] }) {
  const W = 240;
  const gap = 4;
  const col = (W - gap * 11) / 12;
  let x = 0;
  let y = 0;
  let rowH = 0;
  const boxes: { x: number; y: number; w: number; h: number; c: ChartSpec }[] = [];
  for (const c of charts.slice(0, 12)) {
    const span = SPAN[c.size];
    const h = c.visualization === "kpi" ? 18 : 34;
    if (x + span > 12) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    boxes.push({ x: x * (col + gap), y, w: span * col + (span - 1) * gap, h, c });
    x += span;
    rowH = Math.max(rowH, h);
  }
  const H = Math.max(60, Math.min(120, y + rowH));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" aria-hidden preserveAspectRatio="xMidYMin meet">
      {boxes.length === 0 && (
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="10" fill="#8a94a5">
          Empty dashboard
        </text>
      )}
      {boxes.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="3" fill="#fff" stroke="#e3e6eb" />
          <Glyph b={b} />
        </g>
      ))}
    </svg>
  );
}

function Glyph({ b }: { b: { x: number; y: number; w: number; h: number; c: ChartSpec } }) {
  const { x, y, w, h, c } = b;
  const px = x + 4;
  const pw = w - 8;
  const base = y + h - 4;
  switch (c.visualization) {
    case "kpi":
      return (
        <>
          <rect x={px} y={y + 4} width={Math.min(pw * 0.5, 24)} height={4} rx="1" fill="#2f3a4d" />
          <rect x={px} y={y + 11} width={Math.min(pw * 0.7, 34)} height={2.5} rx="1" fill="#9ec5f4" />
        </>
      );
    case "bar":
    case "stacked_bar":
    case "distribution": {
      const n = 7;
      return (
        <>
          {Array.from({ length: n }, (_, i) => {
            const bh = (0.35 + ((i * 37) % 10) / 16) * (h - 10);
            return <rect key={i} x={px + (i * pw) / n + 1} y={base - bh} width={pw / n - 2} height={bh} rx="1" fill={c.visualization === "stacked_bar" && i % 2 ? "#eb6834" : "#2a78d6"} opacity="0.85" />;
          })}
        </>
      );
    }
    case "funnel":
      return (
        <>
          {[1, 0.7, 0.45, 0.3].map((f, i) => (
            <rect key={i} x={px} y={y + 5 + i * ((h - 8) / 4)} width={pw * f} height={(h - 8) / 4 - 1.5} rx="1" fill={["#0d366b", "#256abf", "#3987e5", "#6da7ec"][i]} />
          ))}
        </>
      );
    case "cohort_heatmap":
      return (
        <>
          {Array.from({ length: 4 }, (_, r) =>
            Array.from({ length: 6 - r }, (_, cI) => (
              <rect key={`${r}-${cI}`} x={px + (cI * pw) / 6} y={y + 4 + r * ((h - 8) / 4)} width={pw / 6 - 1} height={(h - 8) / 4 - 1} fill={["#184f95", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb", "#eef4fd"][cI]} />
            )),
          )}
        </>
      );
    case "table":
      return (
        <>
          {Array.from({ length: 4 }, (_, i) => (
            <rect key={i} x={px} y={y + 5 + i * ((h - 8) / 4)} width={pw} height={1.5} fill={i === 0 ? "#5f6b7d" : "#cfd4dc"} />
          ))}
        </>
      );
    case "scatter":
      return (
        <>
          {Array.from({ length: 9 }, (_, i) => (
            <circle key={i} cx={px + ((i + 0.5) * pw) / 9} cy={base - ((i * 3 + ((i * 7) % 5)) / 32) * (h - 8)} r="1.6" fill="#2a78d6" />
          ))}
        </>
      );
    default: {
      const pts = Array.from({ length: 8 }, (_, i) => `${px + (i * pw) / 7},${base - (0.25 + (((i * 5) % 7) / 7) * 0.6) * (h - 10)}`).join(" ");
      return (
        <>
          {c.visualization === "area" && <polygon points={`${px},${base} ${pts} ${px + pw},${base}`} fill="#2a78d6" opacity="0.12" />}
          <polyline points={pts} fill="none" stroke="#2a78d6" strokeWidth="1.3" />
          {c.metrics.length > 1 && <polyline points={pts.split(" ").map((p) => { const [a, bb] = p.split(","); return `${a},${Number(bb) + 4}`; }).join(" ")} fill="none" stroke="#eb6834" strokeWidth="1.1" />}
        </>
      );
    }
  }
}
