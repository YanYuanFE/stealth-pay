import {
  ECDiffieHellman,
  deriveSymmetricEncryptionKey,
  AEChaCha,
  AEHintToBytes,
  bytesToAEHint,
  pubKeyAffineToHex,
} from '@fatsolutions/tongo-sdk';

export interface EncryptedSalary {
  cipher0: bigint; // u128 limb0
  cipher1: bigint; // u128 limb1
  cipher2: bigint; // u128 limb2
  cipher3: bigint; // u128 limb3
  nonceLow: bigint; // u128 low
  nonceHigh: bigint; // u128 high
}

export interface PubKey {
  x: string;
  y: string;
}

/**
 * Encrypt a salary using ECDH shared secret between employer and employee.
 * Both employer (with their private key + employee pubkey) and
 * employee (with their private key + employer pubkey) can decrypt.
 */
export async function encryptSalary(
  senderPrivateKey: bigint,
  recipientPubKey: PubKey,
  salary: bigint,
  contractAddress: string,
  nonce: bigint = 0n,
): Promise<EncryptedSalary> {
  // ECDH: sender_sk x recipient_pk = shared_secret
  const recipientHex = pubKeyAffineToHex(recipientPubKey);
  const sharedSecret = ECDiffieHellman(senderPrivateKey, recipientHex);

  // Derive symmetric key via HKDF
  const symmetricKey = await deriveSymmetricEncryptionKey({
    secret: sharedSecret,
    nonce,
    contractAddress,
  });

  // Encrypt with XChaCha20Poly1305
  const cipher = new AEChaCha(symmetricKey);
  const { ciphertext, nonce: aeNonce } = cipher.encryptBalance(salary);

  // Convert to AEBalance (bigints) for storage
  const aeBalance = bytesToAEHint({ ciphertext, nonce: aeNonce });

  // Split u512 ciphertext into 4 u128 limbs
  const ct = aeBalance.ciphertext;
  const mask128 = (1n << 128n) - 1n;
  const cipher0 = ct & mask128;
  const cipher1 = (ct >> 128n) & mask128;
  const cipher2 = (ct >> 256n) & mask128;
  const cipher3 = (ct >> 384n) & mask128;

  // Split u256 nonce into 2 u128
  const n = aeBalance.nonce;
  const nonceLow = n & mask128;
  const nonceHigh = (n >> 128n) & mask128;

  return { cipher0, cipher1, cipher2, cipher3, nonceLow, nonceHigh };
}

/**
 * Decrypt a salary using ECDH shared secret.
 * Works for both employer (using employer_sk + employee_pk)
 * and employee (using employee_sk + employer_pk).
 */
export async function decryptSalary(
  myPrivateKey: bigint,
  otherPubKey: PubKey,
  encrypted: EncryptedSalary,
  contractAddress: string,
  nonce: bigint = 0n,
): Promise<bigint> {
  // ECDH: my_sk x other_pk = shared_secret (same for both sides)
  const otherHex = pubKeyAffineToHex(otherPubKey);
  const sharedSecret = ECDiffieHellman(myPrivateKey, otherHex);

  // Derive same symmetric key
  const symmetricKey = await deriveSymmetricEncryptionKey({
    secret: sharedSecret,
    nonce,
    contractAddress,
  });

  // Reconstruct u512 ciphertext from 4 u128 limbs
  const ct =
    encrypted.cipher0 |
    (encrypted.cipher1 << 128n) |
    (encrypted.cipher2 << 256n) |
    (encrypted.cipher3 << 384n);

  // Reconstruct u256 nonce from 2 u128
  const n = encrypted.nonceLow | (encrypted.nonceHigh << 128n);

  // Convert to bytes
  const aeBalance = { ciphertext: ct, nonce: n };
  const aeBytes = AEHintToBytes(aeBalance);

  // Decrypt
  const cipher = new AEChaCha(symmetricKey);
  return cipher.decryptBalance(aeBytes);
}

/**
 * Parse encrypted salary from contract call result (6 values).
 */
export function parseEncryptedSalary(result: unknown[]): EncryptedSalary {
  return {
    cipher0: BigInt(result[0] as string | number | bigint),
    cipher1: BigInt(result[1] as string | number | bigint),
    cipher2: BigInt(result[2] as string | number | bigint),
    cipher3: BigInt(result[3] as string | number | bigint),
    nonceLow: BigInt(result[4] as string | number | bigint),
    nonceHigh: BigInt(result[5] as string | number | bigint),
  };
}

/**
 * Check if an encrypted salary is empty (all zeros).
 */
export function isEmptySalary(enc: EncryptedSalary): boolean {
  return enc.cipher0 === 0n && enc.cipher1 === 0n && enc.cipher2 === 0n && enc.cipher3 === 0n
    && enc.nonceLow === 0n && enc.nonceHigh === 0n;
}
