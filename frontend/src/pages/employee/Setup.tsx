import { useState } from 'react';
import { useAccount } from '@starknet-react/core';
import { generateTongoKeypair, saveTongoKey, hasSavedKey, loadTongoKey, derivePublicKey, downloadPrivateKey } from '../../lib/crypto';
import { pubKeyAffineToBase58 } from '@fatsolutions/tongo-sdk';
import type { TongoKeypair } from '../../lib/crypto';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CopyButton } from '../../components/CopyButton';

export default function EmployeeSetup() {
  const { address } = useAccount();
  const [keypair, setKeypair] = useState<TongoKeypair | null>(null);
  const [importKey, setImportKey] = useState('');
  const [importedPubkey, setImportedPubkey] = useState<{ x: string; y: string } | null>(null);
  const [importedTongoAddr, setImportedTongoAddr] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const hasKey = hasSavedKey(address);

  const handleGenerate = () => {
    const kp = generateTongoKeypair();
    saveTongoKey(kp.privateKey, address);
    setKeypair(kp);
  };

  const handleImport = () => {
    try {
      const key = BigInt(importKey);
      const pubkey = derivePublicKey(key);
      saveTongoKey(key, address);
      setImportedPubkey(pubkey);
      setImportKey('');
    } catch {
      alert('Invalid private key format');
    }
  };

  const handleShowExisting = () => {
    const key = loadTongoKey(address);
    if (key) {
      const pubkey = derivePublicKey(key);
      setImportedPubkey(pubkey);
      try {
        const addr = pubKeyAffineToBase58({ x: BigInt(pubkey.x), y: BigInt(pubkey.y) });
        setImportedTongoAddr(addr);
      } catch { /* ignore */ }
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold font-serif mb-8 text-balance">Employee Setup</h1>

      {hasKey && !keypair && !importedPubkey && (
        <Alert variant="success" className="mb-8">
          <AlertDescription>
            <p className="font-medium text-green-700">Tongo key found in storage</p>
            <p className="text-sm text-[var(--fg-muted)] mt-1 text-pretty">
              Your confidential account is ready.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShowExisting}
              className="mt-3 border-green-300 text-green-700 hover:bg-green-50"
            >
              Show My Public Key
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!hasKey && !keypair && (
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Generate new */}
          <Card>
            <CardContent className="p-8">
              <h2 className="text-lg font-semibold font-serif mb-4 text-balance">Generate New Keypair</h2>
              <p className="text-[var(--fg-muted)] mb-6 text-sm text-pretty">
                Creates a new Tongo keypair. Share the public key with your employer.
              </p>
              <Button
                onClick={handleGenerate}
                className="w-full"
                size="lg"
              >
                Generate
              </Button>
            </CardContent>
          </Card>

          {/* Import existing */}
          <Card>
            <CardContent className="p-8">
              <h2 className="text-lg font-semibold font-serif mb-4 text-balance">Import Existing Key</h2>
              <p className="text-[var(--fg-muted)] mb-4 text-sm text-pretty">
                Import a Tongo private key you already have.
              </p>
              <Input
                type="password"
                placeholder="0x... (private key)"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                className="mb-3"
              />
              <Button
                variant="outline"
                onClick={handleImport}
                disabled={!importKey}
                className="w-full"
                size="lg"
              >
                Import
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Show generated keypair */}
      {keypair && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold font-serif mb-4 text-green-600 text-balance">Keypair Generated</h2>

            <div className="mb-4">
              <p className="text-sm text-[var(--fg-muted)] mb-1">Public Key (share with employer)</p>
              <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg font-mono text-xs text-[var(--fg)] break-all">
                <div className="flex items-center gap-1 mb-1">
                  <p><span className="text-[var(--fg-faint)]">X:</span> {keypair.publicKey.x}</p>
                  <CopyButton text={keypair.publicKey.x} />
                </div>
                <div className="flex items-center gap-1">
                  <p><span className="text-[var(--fg-faint)]">Y:</span> {keypair.publicKey.y}</p>
                  <CopyButton text={keypair.publicKey.y} />
                </div>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm text-[var(--fg-muted)] mb-1">Tongo Address</p>
              <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg font-mono text-xs text-[var(--fg)] break-all flex items-center gap-1">
                <span>{keypair.tongoAddress}</span>
                <CopyButton text={keypair.tongoAddress} />
              </div>
            </div>

            <Alert variant="destructive">
              <AlertDescription>
                <p className="font-medium">Please download and securely save your private key file.</p>
                <p className="text-sm mt-1">If you lose this key, you lose access to your confidential balance.</p>
              </AlertDescription>
            </Alert>

            <Button
              variant="outline"
              onClick={() => downloadPrivateKey(keypair.privateKey, keypair.tongoAddress)}
              className="w-full mt-4"
              size="lg"
            >
              Download Private Key File
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Show imported/existing pubkey */}
      {importedPubkey && !keypair && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold font-serif mb-4 text-green-600 text-balance">Your Tongo Account</h2>

            {importedTongoAddr && (
              <div className="mb-4">
                <p className="text-sm text-[var(--fg-muted)] mb-1">Tongo Address (share this with your employer)</p>
                <div className="p-3 bg-[var(--brand-light)] border border-[var(--brand)]/20 rounded-lg font-mono text-sm text-[var(--brand)] break-all flex items-center gap-1">
                  <span>{importedTongoAddr}</span>
                  <CopyButton text={importedTongoAddr} />
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="text-sm text-[var(--fg-muted)] mb-1">Public Key</p>
              <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg font-mono text-xs text-[var(--fg)] break-all">
                <div className="flex items-center gap-1 mb-1">
                  <p><span className="text-[var(--fg-faint)]">X:</span> {importedPubkey.x}</p>
                  <CopyButton text={importedPubkey.x} />
                </div>
                <div className="flex items-center gap-1">
                  <p><span className="text-[var(--fg-faint)]">Y:</span> {importedPubkey.y}</p>
                  <CopyButton text={importedPubkey.y} />
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--border)] pt-4">
              {!showPrivateKey ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const key = loadTongoKey(address);
                    if (key) {
                      setRevealedKey('0x' + key.toString(16));
                      setShowPrivateKey(true);
                    }
                  }}
                  className="w-full"
                >
                  Export Private Key
                </Button>
              ) : (
                <div>
                  <p className="text-sm text-[var(--fg-muted)] mb-1">Private Key</p>
                  <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--alert-error-border)] rounded-lg font-mono text-xs text-[var(--fg)] break-all flex items-center gap-1">
                    <span>{revealedKey}</span>
                    {revealedKey && <CopyButton text={revealedKey} />}
                  </div>
                  {importedTongoAddr && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const key = loadTongoKey(address);
                        if (key && importedTongoAddr) downloadPrivateKey(key, importedTongoAddr);
                      }}
                      className="w-full mt-2"
                    >
                      Download Key File
                    </Button>
                  )}
                  <p className="text-xs text-[var(--alert-error-fg)] mt-2">Do not share this key with anyone.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
