import { PORTS, routePorts } from "../config";
import type { Shipment } from "../types";

const CONTINENTS = [
  "M 118 92 L 236 68 L 302 108 L 274 168 L 232 188 L 212 238 L 172 222 L 148 162 Z",
  "M 252 268 L 302 280 L 322 340 L 292 424 L 262 392 L 238 318 Z",
  "M 352 38 L 414 44 L 404 92 L 352 82 Z",
  "M 468 110 L 542 94 L 562 138 L 520 170 L 478 150 Z",
  "M 478 188 L 562 190 L 592 260 L 552 352 L 500 332 L 468 250 Z",
  "M 570 88 L 764 78 L 856 130 L 822 200 L 742 232 L 660 210 L 598 160 Z",
  "M 676 220 L 724 232 L 702 292 L 668 260 Z",
  "M 800 330 L 884 330 L 902 380 L 850 412 L 798 380 Z",
  "M 596 330 L 626 336 L 618 360 L 590 352 Z",
];

function project(code: string) {
  const port = PORTS[code];
  return { x: port.x * 10, y: port.y * 5.2, label: port.label, code: port.code };
}

function arcPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const lift = Math.min(150, distance * 0.38);
  return `M ${from.x} ${from.y} Q ${midX} ${midY - lift} ${to.x} ${to.y}`;
}

export function RouteMap({
  shipment,
  shipments,
}: {
  shipment: Shipment;
  shipments: Shipment[];
}) {
  const [originCode, destinationCode] = routePorts(shipment.route);
  const origin = project(originCode);
  const destination = project(destinationCode);
  const path = arcPath(origin, destination);
  const activePorts = new Set<string>();
  shipments.forEach((item) => {
    const [a, b] = routePorts(item.route);
    activePorts.add(a);
    activePorts.add(b);
  });

  return (
    <div className="relative h-[260px] w-full overflow-hidden rounded-xl border border-rail/60 bg-[#050b16]">
      <svg viewBox="0 0 1000 520" className="h-full w-full" role="img" aria-label="Global route map">
        <defs>
          <radialGradient id="mapGlow" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#0e2238" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#050b16" stopOpacity="1" />
          </radialGradient>
          <linearGradient id="routeStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="55%" stopColor="#7FE3F0" />
            <stop offset="100%" stopColor="#FB7185" />
          </linearGradient>
          <filter id="routeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="1000" height="520" fill="url(#mapGlow)" />
        {Array.from({ length: 13 }).map((_, index) => (
          <line
            key={`v-${index}`}
            x1={index * 80}
            y1="0"
            x2={index * 80}
            y2="520"
            stroke="#15263c"
            strokeWidth="0.6"
            strokeDasharray="3 7"
          />
        ))}
        {Array.from({ length: 8 }).map((_, index) => (
          <line
            key={`h-${index}`}
            x1="0"
            y1={index * 70}
            x2="1000"
            y2={index * 70}
            stroke="#15263c"
            strokeWidth="0.6"
            strokeDasharray="3 7"
          />
        ))}
        {CONTINENTS.map((d, index) => (
          <path
            key={index}
            d={d}
            fill="#0c1a2c"
            stroke="#1e3550"
            strokeWidth="1"
            opacity="0.95"
          />
        ))}
        {Object.keys(PORTS).map((code) => {
          const port = project(code);
          const active = activePorts.has(code);
          return (
            <g key={code} opacity={active ? 0.95 : 0.35}>
              <circle cx={port.x} cy={port.y} r={active ? 4 : 2.5} fill={active ? "#7FE3F0" : "#33506e"} />
              <text
                x={port.x + 7}
                y={port.y + 3}
                fill={active ? "#9DB2CC" : "#33506e"}
                fontSize="14"
                fontWeight="600"
                fontFamily="JetBrains Mono, monospace"
              >
                {code}
              </text>
            </g>
          );
        })}
        <path
          d={path}
          fill="none"
          stroke="url(#routeStroke)"
          strokeWidth="2.2"
          strokeDasharray="8 7"
          filter="url(#routeGlow)"
          className="animate-pulseLine"
        />
        <circle r="4" fill="#ffffff">
          <animateMotion dur="5s" repeatCount="indefinite" path={path} />
        </circle>
        <g>
          <circle cx={origin.x} cy={origin.y} r="7" fill="none" stroke="#2DD4BF" strokeWidth="1.5" opacity="0.8" />
          <circle cx={origin.x} cy={origin.y} r="3" fill="#2DD4BF" />
          <circle cx={destination.x} cy={destination.y} r="7" fill="none" stroke="#FB7185" strokeWidth="1.5" opacity="0.8" />
          <circle cx={destination.x} cy={destination.y} r="3" fill="#FB7185" />
        </g>
      </svg>
      <div className="absolute left-3 top-3 rounded-lg border border-rail/70 bg-abyss/80 px-3 py-2 backdrop-blur">
        <p className="label">Active lane</p>
        <p className="mono mt-1 text-xs text-white">
          {origin.label} <span className="text-ice">-&gt;</span> {destination.label}
        </p>
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-3 rounded-lg border border-rail/70 bg-abyss/80 px-3 py-1.5 text-[10px] text-mist backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" /> origin
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-coral" /> destination
        </span>
      </div>
    </div>
  );
}
