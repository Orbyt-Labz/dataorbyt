import { ImageResponse } from "next/og";

export const alt = "DataOrbyt — Ask Claude for a dashboard. See it right in the conversation.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview: brand mark, headline and a small dashboard card. Generated at build time. */
export default function OpenGraphImage() {
  const bars = [46, 54, 60, 57, 68, 75];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f4ef", padding: 64, fontFamily: "sans-serif", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width="52" height="52" viewBox="0 0 64 64">
              <path d="M18.1 20.1A24 24 0 0 1 50 22.7V7h8v27a26 26 0 0 1-20 25.3v-8.2A18 18 0 0 0 47.4 26a16 16 0 0 0-23.5-.7Z" fill="#101116" />
              <path d="M12.7 29.2a24 24 0 0 0 17.8 30.5v-8.3a16 16 0 0 1-10.2-19.6Z" fill="#101116" />
              <circle cx="17" cy="25" r="6" fill="#1515f5" />
              <circle cx="34" cy="36" r="10" fill="#101116" />
            </svg>
            <div style={{ display: "flex", fontSize: 34, color: "#101116", letterSpacing: -1.5 }}>
              <span>data&nbsp;</span>
              <span style={{ fontWeight: 700 }}>orbyt</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 58, fontWeight: 700, color: "#0e1626", letterSpacing: -2, lineHeight: 1.05 }}>Ask Claude for a dashboard. See it right in the conversation.</div>
            <div style={{ fontSize: 26, color: "#5c6371" }}>Business dashboards for founders and small teams, built from approved metrics.</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 360, alignSelf: "center", background: "#fff", border: "2px solid #e3e6eb", borderRadius: 20, padding: 24, gap: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#0e1626" }}>Activation &amp; revenue by cohort</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150, borderBottom: "2px solid #cfd4dc" }}>
            {bars.map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${h}%`, background: "#2a78d6", borderRadius: "6px 6px 0 0" }} />
            ))}
          </div>
          <div style={{ fontSize: 16, color: "#8a4b05" }}>Illustrative · demo data</div>
        </div>
      </div>
    ),
    size,
  );
}
