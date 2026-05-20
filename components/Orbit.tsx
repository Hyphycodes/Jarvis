import type { ReactNode } from "react";

export type OrbitNode = {
  id: string;
  name: string;
  role?: string;
  recency?: string;
  /** position in unit coordinates: -1..1, with 0,0 at center */
  x: number;
  y: number;
  /** circular avatar visual; pass undefined for empty placeholder */
  avatar?: ReactNode;
  faded?: boolean;
  size?: number;
};

type Props = {
  center: ReactNode;
  nodes: OrbitNode[];
  /** Pixel size of the square stage */
  size?: number;
};

export function Orbit({ center, nodes, size = 360 }: Props) {
  // The drawing area; nodes are placed in a slightly smaller field
  // so labels don't get clipped.
  const field = size * 0.78;

  return (
    <div
      className="relative mx-auto"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Dashed orbit rings */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 text-warm-ivory/15"
      >
        <ellipse
          cx={size / 2}
          cy={size / 2}
          rx={field * 0.42}
          ry={field * 0.42}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
        <ellipse
          cx={size / 2}
          cy={size / 2}
          rx={field * 0.58}
          ry={field * 0.58}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 6"
          opacity="0.5"
        />
      </svg>

      {/* Center "J." */}
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        {center}
      </div>

      {/* Nodes */}
      {nodes.map((n) => {
        const px = size / 2 + (n.x * field) / 2;
        const py = size / 2 + (n.y * field) / 2;
        return (
          <div
            key={n.id}
            className="absolute flex flex-col items-center text-center"
            style={{
              left: px,
              top: py,
              transform: "translate(-50%, -50%)",
              width: 96,
            }}
          >
            <Avatar
              size={n.size ?? 56}
              faded={n.faded}
              content={n.avatar}
            />
            <div
              className={
                "mt-2 text-[11px] uppercase tracking-editorial " +
                (n.faded ? "text-warm-ivory/35" : "text-warm-ivory/85")
              }
            >
              {n.name}
            </div>
            {n.recency ? (
              <div
                className={
                  "text-[10px] " +
                  (n.faded ? "text-warm-ivory/25" : "text-muted-gold/80")
                }
              >
                {n.recency}
              </div>
            ) : null}
            {n.role ? (
              <div
                className={
                  "text-[9.5px] uppercase tracking-editorial " +
                  (n.faded ? "text-warm-ivory/25" : "text-warm-ivory/45")
                }
              >
                {n.role}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Avatar({
  size,
  faded,
  content,
}: {
  size: number;
  faded?: boolean;
  content?: ReactNode;
}) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-full border " +
        (faded
          ? "border-muted-gold/25 opacity-50"
          : "border-muted-gold/70")
      }
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(ellipse at 50% 35%, #2a2a2e 0%, #141416 70%, #0d0d0f 100%)",
      }}
    >
      {content}
    </div>
  );
}
