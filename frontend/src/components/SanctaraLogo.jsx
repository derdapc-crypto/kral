/*
 * SanctaraLogo — v1.7.6 brand mark.
 *
 * Etymology: SANCTARA ← Sanctus (Latin "sacred/protected"). The sigil is a
 * 6-point compass star inside a hexagonal aegis — referencing both the
 * distributed node mesh ("every direction") and the protective layer that
 * separates the Light client from device-side workloads.
 *
 * Renders crisp at any size. Uses currentColor for the wordmark and an
 * inner gradient (matrix-green → cyan) for the sigil so it picks up the
 * surrounding palette.
 */
import React from "react";

export default function SanctaraLogo({
  size = 28,
  showWordmark = true,
  variant = "default",   // "default" | "monochrome"
  className = "",
  testId = "sanctara-logo",
}) {
  const accent  = variant === "monochrome" ? "currentColor" : "#00ff88";
  const accent2 = variant === "monochrome" ? "currentColor" : "#00d9ff";

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`} data-testid={testId}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
        <defs>
          <linearGradient id="sct-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"  stopColor={accent} />
            <stop offset="100%" stopColor={accent2} />
          </linearGradient>
          <radialGradient id="sct-glow" cx="50%" cy="50%" r="55%">
            <stop offset="0%"  stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* Outer glow */}
        <circle cx="32" cy="32" r="30" fill="url(#sct-glow)" />

        {/* Hexagonal aegis */}
        <polygon
          points="32,4 56,18 56,46 32,60 8,46 8,18"
          fill="none"
          stroke="url(#sct-grad)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Inner hex (subtle depth) */}
        <polygon
          points="32,12 49,21.5 49,42.5 32,52 15,42.5 15,21.5"
          fill="none"
          stroke={accent2}
          strokeOpacity="0.35"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* 6-point compass star (sigil) */}
        <g transform="translate(32 32)">
          {/* Vertical axis */}
          <line x1="0" y1="-22" x2="0" y2="22" stroke="url(#sct-grad)" strokeWidth="1.6" strokeLinecap="round" />
          {/* 60° axis */}
          <line x1="-19" y1="-11" x2="19" y2="11" stroke="url(#sct-grad)" strokeWidth="1.6" strokeLinecap="round" />
          {/* 120° axis */}
          <line x1="-19" y1="11" x2="19" y2="-11" stroke="url(#sct-grad)" strokeWidth="1.6" strokeLinecap="round" />

          {/* 6 outer dots */}
          {[0, 60, 120, 180, 240, 300].map((deg, i) => {
            const r = 22;
            const rad = (deg * Math.PI) / 180;
            const cx = Math.cos(rad - Math.PI / 2) * r;
            const cy = Math.sin(rad - Math.PI / 2) * r;
            return <circle key={i} cx={cx} cy={cy} r="2.2" fill={accent} />;
          })}

          {/* Central beacon */}
          <circle r="4.5" fill={accent} />
          <circle r="2.2" fill="#0a0a0a" />
        </g>
      </svg>

      {showWordmark && (
        <span className="font-display font-bold tracking-[0.18em] uppercase"
              style={{ fontSize: Math.max(11, size * 0.46), letterSpacing: "0.18em", color: "currentColor" }}>
          SANCTARA
        </span>
      )}
    </div>
  );
}
