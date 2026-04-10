import { useState } from 'react';
import { useAccount, useProvider } from '@starknet-react/core';
import { Contract } from 'starknet';
import {
  TONGO_CONTRACTS,
  PAYROLL_FACTORY,
  DEFAULT_NETWORK,
  saveCompanyConfig,
} from '../../config/contracts';
import { TOKENS } from '../../config/tokens';
import { generateTongoKeypair, saveTongoKey, downloadPrivateKey } from '../../lib/crypto';
import { pubKeyBase58ToAffine } from '@fatsolutions/tongo-sdk';
import { toHex, getErrorMessage, waitForTx } from '../../lib/utils';
import { toastTxSuccess, toastTxError, contractUrl } from '../../lib/toast';
import type { TongoKeypair } from '../../lib/crypto';
import factoryAbi from '../../abi/payroll_factory.json';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CopyButton } from '../../components/CopyButton';

type Step = 'info' | 'keypair' | 'deploy' | 'done';

const FACTORY_ADDRESS = PAYROLL_FACTORY[DEFAULT_NETWORK];

export default function EmployerSetup() {
  const { account: walletAccount, address } = useAccount();
  const { provider } = useProvider();
  const [step, setStep] = useState<Step>('info');
  const [companyName, setCompanyName] = useState('');
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [keypair, setKeypair] = useState<TongoKeypair | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);
  const [auditorKey, setAuditorKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [keyDownloaded, setKeyDownloaded] = useState(false);

  const tongoAddress = (TONGO_CONTRACTS[DEFAULT_NETWORK] as Record<string, string>)[selectedToken] ?? '';

  const handleGenerateKeypair = () => {
    const kp = generateTongoKeypair();
    saveTongoKey(kp.privateKey, address);
    setKeypair(kp);
    setStep('deploy');
  };

  const handleDeploy = async () => {
    if (!walletAccount || !address) {
      setError('Please connect your wallet first');
      return;
    }
    setDeploying(true);
    setError(null);

    try {
      // Use Contract.populate() to correctly serialize ByteArray
      const factory = new Contract({ abi: factoryAbi, address: FACTORY_ADDRESS, providerOrAccount: provider });
      if (!keypair) throw new Error('Keypair not generated');
      const call = factory.populate('register_company', [
        companyName,
        tongoAddress,
        keypair.publicKey.x,
        keypair.publicKey.y,
      ]);

      const tx = await walletAccount.execute([call]);

      // Wait for tx confirmation
      const confirmed = await waitForTx(provider, tx.transaction_hash, 30);
      let receipt = null;
      if (confirmed) {
        try { receipt = await provider.getTransactionReceipt(tx.transaction_hash); } catch { /* ignore */ }
      }

      // Wait a bit more for state to propagate, then read from factory
      await new Promise(r => setTimeout(r, 5000));
      const factoryReader = new Contract({ abi: factoryAbi, address: FACTORY_ADDRESS, providerOrAccount: provider });

      // Try reading the deployed address, retry a few times
      let addrHex = '0x0';
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const payrollAddress = await factoryReader.get_company(address);
          const val = BigInt(payrollAddress);
          if (val !== 0n) {
            addrHex = toHex(val);
            break;
          }
        } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 3000));
      }

      // If still 0, try reading from tx events
      if (addrHex === '0x0' && receipt && 'events' in receipt) {
        const events = (receipt as any).events;
        if (Array.isArray(events)) {
          for (const event of events) {
            // CompanyRegistered event: data contains payroll address
            if (event.data && event.data.length > 0) {
              const candidate = BigInt(event.data[0]);
              if (candidate !== 0n && candidate !== BigInt(address)) {
                addrHex = toHex(candidate);
                break;
              }
            }
          }
        }
      }

      if (addrHex === '0x0') {
        setError('Company registered but contract address could not be retrieved. Please refresh and check Dashboard.');
        setDeploying(false);
        return;
      }

      setDeployedAddress(addrHex);

      // Set auditor key on-chain if provided
      if (auditorKey.trim()) {
        try {
          const auditorAffine = pubKeyBase58ToAffine(auditorKey.trim());
          await walletAccount!.execute([{
            contractAddress: addrHex,
            entrypoint: 'set_auditor',
            calldata: [toHex(auditorAffine.x), toHex(auditorAffine.y)],
          }]);
        } catch (auditorErr) {
          console.warn('Failed to set auditor (company still registered):', auditorErr);
        }
      }

      saveCompanyConfig({
        companyName,
        payrollContract: addrHex,
        tongoContract: tongoAddress,
        selectedToken,
        adminAddress: address,
        createdAt: Date.now(),
        ...(auditorKey ? { auditorKey } : {}),
      });
      toastTxSuccess('Company registered', tx.transaction_hash);
      setStep('done');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Registration failed'));
      toastTxError('Registration failed', err);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold font-serif text-[var(--fg)] mb-2 text-balance">Register Company</h1>
      <p className="text-[var(--fg-muted)] mb-8 text-pretty">Set up your confidential payroll in 3 steps</p>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {(['info', 'keypair', 'deploy', 'done'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`size-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s ? 'bg-[var(--brand)] text-white' :
              (['info', 'keypair', 'deploy', 'done'].indexOf(step) > i) ? 'bg-[var(--brand-light)] text-[var(--brand)]' :
              'bg-[var(--bg-elevated)] text-[var(--fg-faint)]'
            }`}>
              {i + 1}
            </div>
            {i < 3 && <div className={`w-12 h-0.5 ${
              (['info', 'keypair', 'deploy', 'done'].indexOf(step) > i) ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'
            }`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Company Info */}
      {step === 'info' && (
        <Card>
          <CardContent className="p-8">
            <h2 className="text-lg font-semibold font-serif text-[var(--fg)] mb-6 text-balance">Company Information</h2>

            <div className="mb-6">
              <label className="block text-sm text-[var(--fg-muted)] mb-2">Company Name</label>
              <Input
                type="text"
                placeholder="e.g. Acme Corp"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="py-3"
              />
            </div>

            <div className="mb-8">
              <label className="block text-sm text-[var(--fg-muted)] mb-2">Payment Token</label>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Select payment token">
                {Object.entries(TOKENS).map(([symbol, info]) => (
                  <Button
                    key={symbol}
                    variant={selectedToken === symbol ? 'default' : 'outline'}
                    onClick={() => setSelectedToken(symbol)}
                    className={`px-4 py-3 h-auto flex-col ${
                      selectedToken === symbol ? '' : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div>{symbol}</div>
                    <div className={`text-xs mt-0.5 ${selectedToken === symbol ? 'opacity-70' : 'text-[var(--fg-faint)]'}`}>
                      {info.name}
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-[var(--fg)] mb-1.5">Auditor Public Key <span className="text-[var(--fg-faint)]">(optional)</span></label>
              <Input
                type="text"
                placeholder="Tongo public key for auditor (base58)"
                value={auditorKey}
                onChange={(e) => setAuditorKey(e.target.value)}
              />
              <p className="text-xs text-[var(--fg-faint)] mt-1 text-pretty">
                If provided, an auditor can verify all payroll transactions without seeing individual amounts.
                Leave blank to disable auditing. This can be set later.
              </p>
            </div>

            {!address && (
              <Alert variant="warning" className="mb-6 mt-6">
                <AlertDescription>Please connect your wallet from the header first.</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={() => setStep('keypair')}
              disabled={!companyName.trim() || !address}
              className="w-full mt-6"
              size="lg"
            >
              Next: Generate Keypair
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Keypair */}
      {step === 'keypair' && (
        <Card>
          <CardContent className="p-8">
            <h2 className="text-lg font-semibold font-serif text-[var(--fg)] mb-4 text-balance">Employer Tongo Keypair</h2>
            <p className="text-sm text-[var(--fg-muted)] mb-6 text-pretty">
              This keypair is used to send confidential salary transfers.
              The private key stays in your browser and is never shared.
            </p>

            {!keypair ? (
              <Button
                onClick={handleGenerateKeypair}
                className="w-full"
                size="lg"
              >
                Generate Keypair
              </Button>
            ) : (
              <div>
                <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg mb-4">
                  <p className="text-xs text-[var(--fg-faint)] mb-1">Tongo Address</p>
                  <div className="flex items-center gap-1">
                    <p className="font-mono text-sm text-[var(--fg)] break-all">{keypair.tongoAddress}</p>
                    <CopyButton text={keypair.tongoAddress} />
                  </div>
                </div>

                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>
                    <p className="font-medium">Please download and securely save your private key file.</p>
                    <p className="text-sm mt-1">This is the only way to recover your confidential account. If lost, your funds cannot be accessed.</p>
                  </AlertDescription>
                </Alert>

                <Button
                  variant="outline"
                  onClick={() => {
                    downloadPrivateKey(keypair.privateKey, keypair.tongoAddress);
                    setKeyDownloaded(true);
                  }}
                  className="w-full mb-4"
                  size="lg"
                >
                  {keyDownloaded ? 'Download Again' : 'Download Private Key File'}
                </Button>

                <Button
                  onClick={() => setStep('deploy')}
                  disabled={!keyDownloaded}
                  className="w-full"
                  size="lg"
                >
                  Next: Register Company
                </Button>
                {!keyDownloaded && (
                  <p className="text-xs text-[var(--fg-faint)] text-center mt-2">Download your private key to continue</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Deploy via Factory */}
      {step === 'deploy' && (
        <Card>
          <CardContent className="p-8">
            <h2 className="text-lg font-semibold font-serif text-[var(--fg)] mb-4 text-balance">Register On-Chain</h2>

            <div className="space-y-3 mb-6 text-sm">
              <div className="flex justify-between py-2 border-b border-[var(--border-muted)]">
                <span className="text-[var(--fg-muted)]">Company</span>
                <span className="text-[var(--fg)] font-medium">{companyName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[var(--border-muted)]">
                <span className="text-[var(--fg-muted)]">Token</span>
                <span className="text-[var(--fg)] font-medium">{selectedToken}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[var(--border-muted)]">
                <span className="text-[var(--fg-muted)]">Admin</span>
                <span className="text-[var(--fg-muted)] font-mono text-xs">{address?.slice(0, 10)}...{address?.slice(-6)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[var(--border-muted)]">
                <span className="text-[var(--fg-muted)]">Network</span>
                <span className="text-[var(--fg)]">Starknet Sepolia</span>
              </div>
              {auditorKey && (
                <div className="flex justify-between text-sm py-2 border-t border-[var(--border)]">
                  <span className="text-[var(--fg-muted)]">Auditor</span>
                  <span className="font-mono text-xs text-[var(--fg)]">{auditorKey.slice(0, 12)}...{auditorKey.slice(-6)}</span>
                </div>
              )}
            </div>

            <Alert variant="info" className="mb-6">
              <AlertDescription>
                The factory contract will deploy a dedicated PayrollManager for your company.
                One transaction — approve in your wallet.
              </AlertDescription>
            </Alert>

            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleDeploy}
              disabled={deploying}
              className="w-full"
              size="lg"
            >
              {deploying ? (
                <span className="flex items-center justify-center gap-2">
                  Processing...
                </span>
              ) : 'Register Company'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Done */}
      {step === 'done' && (
        <Card className="text-center">
          <CardContent className="p-8">
            <div className="size-12 bg-[var(--alert-ok-bg)] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-[var(--alert-ok-fg)] text-xl">&#10003;</span>
            </div>
            <h2 className="text-lg font-semibold font-serif text-[var(--fg)] mb-2 text-balance">Company Registered</h2>
            <p className="text-sm text-[var(--fg-muted)] mb-6 text-pretty">
              {companyName} is ready for confidential payroll on Starknet.
            </p>

            {deployedAddress && (
              <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg mb-6 text-left">
                <p className="text-xs text-[var(--fg-faint)] mb-1">Your Payroll Contract</p>
                <div className="flex items-center gap-1">
                  <a href={contractUrl(deployedAddress)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-[var(--brand)] hover:text-[var(--brand-hover)] underline break-all">{deployedAddress}</a>
                  <CopyButton text={deployedAddress} />
                </div>
              </div>
            )}

            <Button
              onClick={() => window.location.reload()}
              className="w-full"
              size="lg"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
