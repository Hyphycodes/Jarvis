/**
 * Atmospheric visuals for the four logged-out empty states.
 * SVG/CSS only — no images yet. Tuned to feel editorial against near-black.
 */

const gold = "rgba(184,146,74,0.85)";
const goldSoft = "rgba(201,169,110,0.55)";
const ivorySoft = "rgba(240,236,216,0.35)";

export function SunriseVisual() {
  return (
    <div
      aria-hidden
      className="relative mx-auto h-[220px] w-full overflow-hidden"
    >
      {/* sky-to-water gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #050507 0%, #100b08 35%, #1f160e 60%, #0a0a0b 100%)",
        }}
      />
      {/* warm halo around the sun */}
      <div
        className="absolute inset-x-0 bottom-[42%] mx-auto h-40 w-40"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(232,180,90,0.55), rgba(184,146,74,0.18) 35%, transparent 70%)",
          filter: "blur(1px)",
        }}
      />
      {/* sun disc */}
      <div
        className="absolute left-1/2 bottom-[44%] h-3 w-12 -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(255,228,170,0.95), rgba(232,180,90,0.6) 60%, transparent 100%)",
        }}
      />
      {/* horizon line + reflection */}
      <div
        className="absolute inset-x-0 bottom-[42%] h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(232,180,90,0.45), transparent)",
        }}
      />
      <div
        className="absolute inset-x-[20%] bottom-[18%] h-[24%] opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(184,146,74,0.30), transparent 70%)",
          filter: "blur(2px)",
        }}
      />
      {/* bottom fade into page */}
      <div
        className="absolute inset-x-0 bottom-0 h-20"
        style={{
          background: "linear-gradient(180deg, transparent, #0A0A0B)",
        }}
      />
    </div>
  );
}

export function RadarVisual() {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <div className="mx-auto" aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="radar-sweep" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={gold} stopOpacity="0" />
            <stop offset="80%" stopColor={gold} stopOpacity="0.7" />
            <stop offset="100%" stopColor={gold} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* concentric rings */}
        {[0.25, 0.5, 0.75, 1].map((r, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={(size / 2 - 6) * r}
            fill="none"
            stroke={ivorySoft}
            strokeWidth="1"
            opacity={0.45 - i * 0.06}
          />
        ))}
        {/* cross hairs */}
        <line
          x1={cx}
          y1={6}
          x2={cx}
          y2={size - 6}
          stroke={ivorySoft}
          strokeWidth="1"
          opacity="0.25"
        />
        <line
          x1={6}
          y1={cy}
          x2={size - 6}
          y2={cy}
          stroke={ivorySoft}
          strokeWidth="1"
          opacity="0.25"
        />
        {/* sweep wedge */}
        <path
          d={`M ${cx} ${cy} L ${cx + (size / 2 - 10)} ${cy - (size / 2 - 10) * 0.55} A ${size / 2 - 10} ${size / 2 - 10} 0 0 0 ${cx + (size / 2 - 10)} ${cy + 4} Z`}
          fill="url(#radar-sweep)"
          opacity="0.7"
        />
        {/* sweep arm */}
        <line
          x1={cx}
          y1={cy}
          x2={cx + (size / 2 - 10) * 0.95}
          y2={cy - (size / 2 - 10) * 0.5}
          stroke={gold}
          strokeWidth="1"
          opacity="0.9"
        />
        {/* center dot */}
        <circle cx={cx} cy={cy} r="2" fill={gold} />
      </svg>
    </div>
  );
}

export function OrbitVisual() {
  const w = 280;
  const h = 160;
  const cx = w / 2;
  const cy = h / 2;
  return (
    <div className="mx-auto" aria-hidden>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {/* outer ellipse */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={w / 2 - 14}
          ry={h / 2 - 18}
          fill="none"
          stroke={goldSoft}
          strokeWidth="1"
          opacity="0.6"
        />
        {/* inner faint ellipse */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={w / 2 - 30}
          ry={h / 2 - 32}
          fill="none"
          stroke={ivorySoft}
          strokeWidth="1"
          opacity="0.35"
          strokeDasharray="1 4"
        />
        {/* two silhouette avatars */}
        <Silhouette cx={cx - 36} cy={cy - 6} />
        <Silhouette cx={cx + 36} cy={cy - 6} />
        {/* nodes on the orbit */}
        <circle cx={cx - (w / 2 - 14)} cy={cy} r="2" fill={goldSoft} />
        <circle cx={cx + (w / 2 - 14)} cy={cy} r="2" fill={goldSoft} />
        <circle cx={cx} cy={cy + (h / 2 - 18)} r="2" fill={goldSoft} />
      </svg>
    </div>
  );
}

function Silhouette({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity="0.85">
      {/* head */}
      <circle cx={cx} cy={cy - 12} r="9" fill="rgba(232,228,168,0.10)" stroke={goldSoft} strokeWidth="0.75" />
      {/* shoulders */}
      <path
        d={`M ${cx - 18} ${cy + 16} Q ${cx} ${cy - 6} ${cx + 18} ${cy + 16} Z`}
        fill="rgba(232,228,168,0.08)"
        stroke={goldSoft}
        strokeWidth="0.75"
      />
    </g>
  );
}

export function CompassVisual() {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 16;
  return (
    <div className="mx-auto" aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* outer ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={ivorySoft}
          strokeWidth="1"
          opacity="0.5"
        />
        {/* inner ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r * 0.78}
          fill="none"
          stroke={goldSoft}
          strokeWidth="1"
          opacity="0.45"
        />
        {/* cardinal ticks */}
        <line x1={cx} y1={cy - r} x2={cx} y2={cy - r + 8} stroke={gold} strokeWidth="1.25" />
        <line x1={cx} y1={cy + r} x2={cx} y2={cy + r - 8} stroke={goldSoft} strokeWidth="1" />
        <line x1={cx - r} y1={cy} x2={cx - r + 8} y2={cy} stroke={goldSoft} strokeWidth="1" />
        <line x1={cx + r} y1={cy} x2={cx + r - 8} y2={cy} stroke={goldSoft} strokeWidth="1" />
        {/* labels */}
        <text x={cx} y={cy - r - 6} fontSize="10" fill="rgba(240,236,216,0.6)" textAnchor="middle" fontFamily="serif">
          N
        </text>
        <text x={cx} y={cy + r + 14} fontSize="10" fill="rgba(240,236,216,0.45)" textAnchor="middle" fontFamily="serif">
          S
        </text>
        <text x={cx - r - 8} y={cy + 4} fontSize="10" fill="rgba(240,236,216,0.45)" textAnchor="end" fontFamily="serif">
          W
        </text>
        <text x={cx + r + 8} y={cy + 4} fontSize="10" fill="rgba(240,236,216,0.45)" textAnchor="start" fontFamily="serif">
          E
        </text>
        {/* compass star */}
        <CompassStar cx={cx} cy={cy} r={r * 0.7} />
        <circle cx={cx} cy={cy} r="3" fill={gold} />
      </svg>
    </div>
  );
}

function CompassStar({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  // Four major points + four minor points
  const points = [
    [cx, cy - r], // N
    [cx + r * 0.18, cy - r * 0.18],
    [cx + r, cy], // E
    [cx + r * 0.18, cy + r * 0.18],
    [cx, cy + r], // S
    [cx - r * 0.18, cy + r * 0.18],
    [cx - r, cy], // W
    [cx - r * 0.18, cy - r * 0.18],
  ];
  // Major arms
  return (
    <g opacity="0.9">
      {[0, 2, 4, 6].map((i) => (
        <polygon
          key={i}
          points={`${points[i][0]},${points[i][1]} ${points[(i + 1) % 8][0]},${points[(i + 1) % 8][1]} ${cx},${cy} ${points[(i + 7) % 8][0]},${points[(i + 7) % 8][1]}`}
          fill={gold}
          opacity={i === 0 ? 1 : 0.85}
        />
      ))}
      {[1, 3, 5, 7].map((i) => (
        <polygon
          key={i}
          points={`${points[i][0]},${points[i][1]} ${cx},${cy} ${points[(i + 7) % 8][0]},${points[(i + 7) % 8][1]}`}
          fill="rgba(184,146,74,0.55)"
        />
      ))}
    </g>
  );
}
