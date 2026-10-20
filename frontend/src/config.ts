export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0xF5cfd095EB3FE684DFe3c48b751D9817EAa48317") as `0x${string}`;

export const STUDIONET_RPC =
  import.meta.env.VITE_STUDIONET_RPC || "https://studio.genlayer.com/api";

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 61999);
export const FPT_DECIMALS = 6;

export const REPO_URL = "https://github.com/richeroveis/freight-pulse";
export const EVIDENCE_URL = `${REPO_URL}/blob/main/evidence/studionet_deployment.json`;
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";
export const DEMO_VIDEO_URL = `${REPO_URL}/releases/download/studionet-v1/demo-video-subtitled.mp4`;

export const PRINCIPLE_TEXT =
  "Both validator answers must be identical on three consensus fields: fulfilment_band " +
  "must be exactly the same discrete value, customs_cleared must be exactly the same " +
  "boolean, and temp_breached must be exactly the same boolean. peak_temp_celsius must " +
  "agree within 0.5 C and transit_hours within 0.05 h. If either answer is missing a " +
  "field, or if one answer failed to bind the bill of lading, the answers are not equivalent. " +
  "Both answers must also agree with the deterministic manifest fields on band, customs and breach.";

export const MANIFEST_ASSET_BASE = `${REPO_URL.replace(
  "github.com",
  "raw.githubusercontent.com",
)}/main/evidence/manifests/`;

export const PORTS: Record<string, { x: number; y: number; label: string; code: string }> = {
  GVA: { x: 32.2, y: 37.5, label: "Geneva", code: "GVA" },
  RTM: { x: 30.8, y: 31.5, label: "Rotterdam", code: "RTM" },
  OSL: { x: 34.5, y: 22.6, label: "Oslo", code: "OSL" },
  SIN: { x: 80.4, y: 62.5, label: "Singapore", code: "SIN" },
  TYO: { x: 88.1, y: 39.8, label: "Tokyo", code: "TYO" },
  NYC: { x: 20.6, y: 40.5, label: "New York", code: "NYC" },
  DXB: { x: 67.8, y: 50.2, label: "Dubai", code: "DXB" },
  BCN: { x: 30.2, y: 45.8, label: "Barcelona", code: "BCN" },
  HAM: { x: 32.4, y: 29.2, label: "Hamburg", code: "HAM" },
  LAX: { x: 8.4, y: 44.2, label: "Los Angeles", code: "LAX" },
};

export function routePorts(route: string): [string, string] {
  const upper = route.toUpperCase();
  const codes = Object.keys(PORTS).filter((code) => upper.includes(code));
  if (codes.length >= 2) return [codes[0], codes[1]];
  return ["GVA", "SIN"];
}
