import { derivePublicKey as tongoDerivePubKey, pubKeyAffineToBase58 } from '@fatsolutions/tongo-sdk';
import { toHex } from './utils';

const STORAGE_KEY = 'stealthpay_tongo_key';

export interface TongoKeypair {
  privateKey: bigint;
  publicKey: { x: string; y: string };
  tongoAddress: string; // base58
}

// Stark curve order
const CURVE_ORDER = 3618502788666131213697322783095070105526743751716087489154079457884512865583n;

export function generateTongoKeypair(): TongoKeypair {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''));
  const privateKey = (raw % (CURVE_ORDER - 2n)) + 1n; // 1 <= key < CURVE_ORDER

  const pubKey = tongoDerivePubKey(privateKey);
  const tongoAddress = pubKeyAffineToBase58(pubKey);

  return {
    privateKey,
    publicKey: {
      x: toHex(pubKey.x),
      y: toHex(pubKey.y),
    },
    tongoAddress,
  };
}

export function derivePublicKey(privateKey: bigint): { x: string; y: string } {
  const pubKey = tongoDerivePubKey(privateKey);
  return {
    x: toHex(pubKey.x),
    y: toHex(pubKey.y),
  };
}

export function saveTongoKey(key: bigint): void {
  const hex = key.toString(16);
  localStorage.setItem(STORAGE_KEY, hex);
}

export function loadTongoKey(): bigint | null {
  const hex = localStorage.getItem(STORAGE_KEY);
  if (!hex) return null;
  try {
    return BigInt('0x' + hex);
  } catch {
    return null;
  }
}

export function hasSavedKey(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function clearTongoKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}
