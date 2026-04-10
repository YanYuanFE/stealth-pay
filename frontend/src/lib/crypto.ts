import { derivePublicKey as tongoDerivePubKey, pubKeyAffineToBase58 } from '@fatsolutions/tongo-sdk';
import { toHex } from './utils';

const STORAGE_PREFIX = 'stealthpay_tongo_key_';
const LEGACY_KEY = 'stealthpay_tongo_key';

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
  const privateKey = (raw % (CURVE_ORDER - 2n)) + 1n;

  const pubKey = tongoDerivePubKey(privateKey);
  const tongoAddress = pubKeyAffineToBase58(pubKey);

  return {
    privateKey,
    publicKey: { x: toHex(pubKey.x), y: toHex(pubKey.y) },
    tongoAddress,
  };
}

export function derivePublicKey(privateKey: bigint): { x: string; y: string } {
  const pubKey = tongoDerivePubKey(privateKey);
  return { x: toHex(pubKey.x), y: toHex(pubKey.y) };
}

function storageKey(walletAddress?: string): string {
  if (walletAddress) return STORAGE_PREFIX + walletAddress.toLowerCase();
  return LEGACY_KEY;
}

export function saveTongoKey(key: bigint, walletAddress?: string): void {
  const hex = key.toString(16);
  localStorage.setItem(storageKey(walletAddress), hex);
  // Also save to legacy key for backward compat
  localStorage.setItem(LEGACY_KEY, hex);
}

export function loadTongoKey(walletAddress?: string): bigint | null {
  // Try address-specific key first
  if (walletAddress) {
    const hex = localStorage.getItem(storageKey(walletAddress));
    if (hex) {
      try { return BigInt('0x' + hex); } catch { /* fall through */ }
    }
  }
  // Fall back to legacy key
  const hex = localStorage.getItem(LEGACY_KEY);
  if (!hex) return null;
  try { return BigInt('0x' + hex); } catch { return null; }
}

export function hasSavedKey(walletAddress?: string): boolean {
  if (walletAddress && localStorage.getItem(storageKey(walletAddress))) return true;
  return localStorage.getItem(LEGACY_KEY) !== null;
}

export function clearTongoKey(walletAddress?: string): void {
  if (walletAddress) localStorage.removeItem(storageKey(walletAddress));
  localStorage.removeItem(LEGACY_KEY);
}

/** Download private key as a .txt file */
export function downloadPrivateKey(privateKey: bigint, tongoAddress: string): void {
  const hex = '0x' + privateKey.toString(16);
  const content = [
    'Tongo Private Key Backup',
    '========================',
    '',
    `Tongo Address: ${tongoAddress}`,
    `Private Key:   ${hex}`,
    '',
    'WARNING: Anyone with this private key can access your confidential balance.',
    'Store this file in a secure location and delete it from your downloads.',
  ].join('\n');

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tongo-key-${tongoAddress.slice(0, 8)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
