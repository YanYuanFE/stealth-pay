import { useAccount, useConnect, useDisconnect } from '@starknet-react/core';
import { useStarknetkitConnectModal } from 'starknetkit';
import { Button } from '@/components/ui/button';

export default function ConnectWallet() {
  const { address, status } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { starknetkitConnectModal } = useStarknetkitConnectModal({
    connectors: connectors as never[],
  });

  const handleConnect = async () => {
    const { connector } = await starknetkitConnectModal();
    if (!connector) return;
    await connect({ connector: connector as never });
  };

  if (status === 'connected' && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-[var(--fg-muted)]">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <Button variant="outline" size="sm" onClick={() => disconnect()}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={handleConnect}>
      Connect Wallet
    </Button>
  );
}
