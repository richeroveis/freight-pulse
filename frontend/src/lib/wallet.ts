import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CHAIN_ID, STUDIONET_RPC } from "../config";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type BurnerAccount = ReturnType<typeof createAccount>;

export type WalletSession =
  | { kind: "burner"; address: string; account: BurnerAccount }
  | { kind: "metamask"; address: string; provider: EthereumProvider };

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function createBurnerSession(): WalletSession {
  // A burner key may be supplied through localStorage so automated end-to-end
  // runs and power users can reuse a pre-funded test account. The key stays in
  // the page memory, is never sent anywhere and is never logged. With no stored
  // key the button behaves as a fresh one-click burner.
  const storedKey = readStoredBurnerKey();
  const account = storedKey ? createAccount(storedKey) : createAccount();
  return { kind: "burner", address: account.address, account };
}

function readStoredBurnerKey(): `0x${string}` | null {
  try {
    const raw = window.localStorage.getItem("fp_burner_key");
    if (!raw) return null;
    const trimmed = raw.trim().replace(/^0x/i, "");
    return /^[0-9a-fA-F]{64}$/.test(trimmed) ? (`0x${trimmed}` as `0x${string}`) : null;
  } catch {
    return null;
  }
}

export async function connectMetaMask(): Promise<WalletSession> {
  const provider = window.ethereum;
  if (!provider) {
    throw new Error("MetaMask is not installed in this browser.");
  }
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts || accounts.length === 0) {
    throw new Error("MetaMask returned no account.");
  }
  const chainIdHex = `0x${CHAIN_ID.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 4902 || code === -32603) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: "GenLayer Studio Network",
            nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
            rpcUrls: [STUDIONET_RPC],
            blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
          },
        ],
      });
    } else {
      throw error;
    }
  }
  return { kind: "metamask", address: accounts[0], provider };
}

export function walletClient(session: WalletSession) {
  if (session.kind === "burner") {
    return createClient({ chain: studionet, account: session.account, endpoint: STUDIONET_RPC });
  }
  return createClient({
    chain: studionet,
    account: session.address as `0x${string}`,
    provider: session.provider,
    endpoint: STUDIONET_RPC,
  });
}

export function publicClient() {
  return createClient({ chain: studionet, endpoint: STUDIONET_RPC });
}
