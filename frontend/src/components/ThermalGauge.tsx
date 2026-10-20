import { formatTemp } from "../lib/format";

const CENTER = 120;
const RADIUS = 88;
const START_ANGLE = -120;
const END_ANGLE = 120;
const SWEEP = END_ANGLE - START_ANGLE;

function polar(angle: number, radius = RADIUS) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
}

function arc(startAngle: number, endAngle: number, radius = RADIUS) {
  const start = polar(startAngle, radius);
  const end = polar(endAngle, radius);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function ThermalGauge({
  recordedCX100,
  ceilingCX100,
  breached,
}: {
  recordedCX100: number;
  ceilingCX100: number;
  breached: boolean;
}) {
  const min = Math.min(-30, Math.floor((ceilingCX100 - 2000) / 100));
  const max = Math.max(30, Math.ceil((ceilingCX100 + 2000) / 100));
  const clamp = (value: number) => Math.min(max, Math.max(min, value));
  const recordedC = clamp(recordedCX100 / 100);
  const ceilingC = clamp(ceilingCX100 / 100);
  const angleFor = (value: number) => START_ANGLE + ((value - min) / (max - min)) * SWEEP;
  const recordedAngle = angleFor(recordedC);
  const ceilingAngle = angleFor(ceilingC);
  const needle = polar(recordedAngle, RADIUS - 22);
  const ticks = Array.from({ length: 13 }).map((_, index) => {
    const value = min + ((max - min) * index) / 12;
    const angle = angleFor(value);
    const outer = polar(angle, RADIUS + 6);
    const inner = polar(angle, RADIUS - (index % 3 === 0 ? 12 : 7));
    return { value, angle, outer, inner, major: index % 3 === 0 };
  });
  const delta = (recordedCX100 - ceilingCX100) / 100;
  const activeColor = breached ? "#FB7185" : "#2DD4BF";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 240 210" className="w-full max-w-[260px]">
        <defs>
          <linearGradient id="gaugeSafe" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="100%" stopColor="#7FE3F0" />
          </linearGradient>
          <filter id="needleGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path d={arc(START_ANGLE, END_ANGLE)} fill="none" stroke="#1B2C44" strokeWidth="12" strokeLinecap="round" />
        <path
          d={arc(START_ANGLE, ceilingAngle)}
          fill="none"
          stroke="url(#gaugeSafe)"
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d={arc(ceilingAngle, END_ANGLE)}
          fill="none"
          stroke="#FB7185"
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.85"
        />

        {ticks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={tick.inner.x}
              y1={tick.inner.y}
              x2={tick.outer.x}
              y2={tick.outer.y}
              stroke={tick.value > ceilingC ? "#FB7185" : "#6A88A8"}
              strokeWidth={tick.major ? 1.6 : 0.8}
              opacity={tick.major ? 0.9 : 0.5}
            />
            {tick.major ? (
              <text
                x={polar(tick.angle, RADIUS + 18).x}
                y={polar(tick.angle, RADIUS + 18).y}
                fill="#9DB2CC"
                fontSize="8"
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace"
              >
                {Math.round(tick.value)}
              </text>
            ) : null}
          </g>
        ))}

        <line
          x1={polar(ceilingAngle, RADIUS - 26).x}
          y1={polar(ceilingAngle, RADIUS - 26).y}
          x2={polar(ceilingAngle, RADIUS + 4).x}
          y2={polar(ceilingAngle, RADIUS + 4).y}
          stroke="#FBBF24"
          strokeWidth="2"
          strokeDasharray="3 3"
        />
        <text
          x={polar(ceilingAngle, RADIUS + 18).x}
          y={polar(ceilingAngle, RADIUS + 18).y + 9}
          fill="#FBBF24"
          fontSize="7"
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
        >
          CEILING
        </text>

        <line
          x1={CENTER}
          y1={CENTER}
          x2={needle.x}
          y2={needle.y}
          stroke={activeColor}
          strokeWidth="3"
          strokeLinecap="round"
          filter="url(#needleGlow)"
        />
        <circle cx={CENTER} cy={CENTER} r="7" fill="#0A1424" stroke={activeColor} strokeWidth="2.5" />
        <circle cx={CENTER} cy={CENTER} r="2" fill={activeColor} />

        <text x={CENTER} y={CENTER + 42} textAnchor="middle" fill="#FFFFFF" fontSize="22" fontWeight="600" fontFamily="JetBrains Mono, monospace">
          {formatTemp(recordedCX100)}
        </text>
        <text x={CENTER} y={CENTER + 58} textAnchor="middle" fill="#9DB2CC" fontSize="8" fontFamily="JetBrains Mono, monospace">
          RECORDED PEAK
        </text>
      </svg>
      <div className="mt-1 grid w-full grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-rail/60 bg-deck/50 px-2 py-1.5">
          <p className="label">Ceiling</p>
          <p className="mono mt-0.5 text-[11px] text-amber">{formatTemp(ceilingCX100)}</p>
        </div>
        <div className="rounded-lg border border-rail/60 bg-deck/50 px-2 py-1.5">
          <p className="label">Delta</p>
          <p className={`mono mt-0.5 text-[11px] ${breached ? "text-coral" : "text-teal"}`}>
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(2)} C
          </p>
        </div>
        <div className="rounded-lg border border-rail/60 bg-deck/50 px-2 py-1.5">
          <p className="label">State</p>
          <p className={`mono mt-0.5 text-[11px] ${breached ? "text-coral" : "text-teal"}`}>
            {breached ? "BREACH" : "INTACT"}
          </p>
        </div>
      </div>
    </div>
  );
}
