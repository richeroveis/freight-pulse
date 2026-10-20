import type { ProbeId } from "../types";

export interface GuardEvidence {
  id: ProbeId;
  label: string;
  rule: string;
  revertReason: string;
  txHash: string;
  status: string;
}

export const GUARD_EVIDENCE: GuardEvidence[] = [
  {
    "id": "untrusted-url",
    "label": "guard untrusted manifest URL",
    "rule": "submit_delivery_manifest accepts only public HTTPS document URLs.",
    "revertReason": "[EXPECTED] manifest URL must use https",
    "txHash": "0xcdcaaca8cea80b57d4654bee8577fca7f97a3097c5cbf0fd7c2399fe21dbe4f1",
    "status": "FINALIZED"
  },
  {
    "id": "premature-reclaim",
    "label": "guard premature reclaim after manifest",
    "rule": "reclaim_expired_shipment is blocked while status is MANIFEST_SUBMITTED.",
    "revertReason": "[EXPECTED] manifest was submitted on time, reclaim is blocked pending verification",
    "txHash": "0x73d65da17044344bc005725a9f9efc9ec7335d8bbce9a5711348662e2b942781",
    "status": "FINALIZED"
  },
  {
    "id": "unilateral-release",
    "label": "guard unilateral mutual release",
    "rule": "propose_mutual_release requires shipper and carrier, and both stored bps must match.",
    "revertReason": "[EXPECTED] only the shipper or the carrier can co-sign",
    "txHash": "0xeeb31ffbac32438cfd99f27309c177d84d16e49d1d170baaab253723d6d27b04",
    "status": "FINALIZED"
  }
];

export const DEPLOY_TX_HASH = "0xa95f9b381dde640b73949c284df8a67d06148f12b1f4c8d01755f5fe85752d95";

export const FOUR_WAY = {
  contractFile: "96e5c244eee45982a70413b6ed9b1f79bfb8f5e2ccae1730f2a7a6887f08e0f5",
  gitBlob: "96e5c244eee45982a70413b6ed9b1f79bfb8f5e2ccae1730f2a7a6887f08e0f5",
  deployPayload: "96e5c244eee45982a70413b6ed9b1f79bfb8f5e2ccae1730f2a7a6887f08e0f5",
  onChain: "96e5c244eee45982a70413b6ed9b1f79bfb8f5e2ccae1730f2a7a6887f08e0f5",
  allMatch: true,
};

export const AUDIT_TX_BY_SHIPMENT: Record<number, string> = {
  "1": "0xbc18f277c682eee0235d4d8301ff7a9fb61c5826daac1c45e68d51403dfb56ec",
  "2": "0x72e3f64442d5b015e77fbeeb996d249e070d3948959cf41d1815bea81433d8d0",
  "3": "0xca523f557ee2523218bab115f7017b32ee3e2ab63bbf7777293f0aa9293c5072",
  "4": "",
  "5": "0x90cba23d1dd071979e4feb4b9241ce115a37dc4e69a9383f384555309713382c",
  "6": ""
};

export const CLAIM_TX_BY_SHIPMENT: Record<number, string> = {
  "1": "0x86ea647f391eebc61d0d112bbdbb1d70367034c6c5ce2c80ccbe9a71da75fbfa",
  "2": "0xee07d5d259f9090f694eae87a482f9d9a7315ac26a4ce83f1ccc4e45c7c0b52b",
  "3": "0x00cfc3e1b922d87205e81001c926d7c48a9497acad19297763f762f587b26ead",
  "4": "",
  "5": "0x864c374d647b9e8ce3656ececd7503c01a1da2047acb20fa1b6dc903b0832bae",
  "6": ""
};
