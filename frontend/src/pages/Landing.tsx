import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';

/* ── SVG Icons ── */
const ShieldIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M8 11h8" /><path d="M10 15h4" />
  </svg>
);

const ArrowRight = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);

/* ── Cipher Ring Animation ── */
function CipherRing({ theme }: { theme: string }) {
  return (
    <div className="relative w-64 h-64 mb-12 flex items-center justify-center animate-float">
      <div className="absolute inset-0 bg-[var(--brand-light)] blur-[50px] rounded-full animate-pulse-glow opacity-70" />
      <div className="absolute inset-0 rounded-full cipher-ring animate-spin-slow">
        <div className="absolute top-0 left-1/2 w-2 h-2 bg-[var(--brand)] rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-1/2 w-1 h-3 bg-[var(--border)] -translate-x-1/2 translate-y-1/2" />
      </div>
      <div className="absolute inset-8 rounded-full cipher-ring border-dashed animate-spin-reverse-slow">
        <div className="absolute left-0 top-1/2 w-2 h-2 bg-[var(--fg-faint)] rounded-full -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className="absolute inset-16 rounded-full border border-[var(--border)] animate-spin-slow">
        <svg className="absolute inset-0 w-full h-full text-[var(--fg-faint)] opacity-30" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="49" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 6" />
        </svg>
      </div>
      <div className="relative z-10 w-24 h-24 glass-panel rounded-[32px] shadow-lg flex items-center justify-center overflow-hidden">
        <img
          src={theme === 'dark' ? '/stealthpay-icon-dark.png' : '/stealthpay-icon-light.png'}
          alt="StealthPay"
          className="size-16 rounded-xl"
        />
      </div>
      <div className="absolute -right-8 top-8 font-mono-accent text-[11px] text-[var(--fg-faint)] opacity-70 pointer-events-none hidden sm:block">
        [0x7A...F91]<br />verifyProof()
      </div>
      <div className="absolute -left-12 bottom-10 font-mono-accent text-[11px] text-[var(--fg-faint)] opacity-70 pointer-events-none hidden sm:block text-right">
        ZK_SNARK<br />val: ***
      </div>
    </div>
  );
}

/* ── Feature Card ── */
function FeatureCard({ tag, icon, bgIcon, gradientLight, gradientDark, isDark, title, desc, footer, delay }: {
  tag: string; icon: React.ReactNode; bgIcon?: React.ReactNode; gradientLight?: string; gradientDark?: string; isDark: boolean; title: string; desc: string; footer: React.ReactNode; delay: string;
}) {
  const from = isDark ? gradientDark?.split(' ')[0] : gradientLight?.split(' ')[0];
  const to = isDark ? gradientDark?.split(' ')[1] : gradientLight?.split(' ')[1];
  return (
    <div
      className="group rounded-[28px] p-8 sm:p-10 hover:-translate-y-1 transition-all duration-300 shadow-sm relative overflow-hidden animate-fade-up"
      style={{
        animationDelay: delay,
        background: from && to ? `linear-gradient(to bottom right, ${from}, ${to})` : undefined,
        backgroundColor: !from ? 'var(--bg-card)' : undefined,
      }}
    >
      {bgIcon && (
        <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
          {bgIcon}
        </div>
      )}
      <div className="w-10 h-10 mb-6 text-[var(--brand)]">{icon}</div>
      <span className="font-mono-accent text-[11px] text-[var(--fg-faint)] uppercase">{tag}</span>
      <h3 className="text-xl font-serif font-medium mt-1 mb-3 text-[var(--fg)]">{title}</h3>
      <p className="text-[var(--fg-muted)] leading-relaxed text-sm mb-5">{desc}</p>
      {footer}
    </div>
  );
}

/* ── Main Landing ── */
export default function Landing() {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--bg)] text-[var(--fg)]">
      {/* Background glow */}
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-full max-w-5xl h-[700px] bg-[var(--brand-light)] blur-[120px] rounded-full pointer-events-none -z-10 opacity-70" />

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 w-full bg-[var(--bg)]/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={theme === 'dark' ? '/stealthpay-icon-dark.png' : '/stealthpay-icon-light.png'}
              alt=""
              className="size-8 rounded-lg"
            />
            <span className="font-serif font-medium text-xl text-[var(--fg)]">StealthPay</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggle}
              className="p-2 rounded-full hover:bg-[var(--bg-elevated)] text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <div className="h-4 w-px bg-[var(--border)] mx-1" />
            <Link to="/employee/setup" className="text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors hidden sm:block">
              For Employees
            </Link>
            <Link to="/auditor/portal" className="text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors hidden sm:block">
              Auditor
            </Link>
            <Link to="/employer/dashboard" className="bg-[var(--fg)] text-[var(--bg)] hover:opacity-90 text-sm font-medium px-5 py-2.5 rounded-full shadow-sm transition-all active:scale-95">
              Launch App
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="flex-grow flex flex-col items-center justify-center pt-16 pb-32 px-6 relative z-10">
        <section className="w-full max-w-4xl mx-auto text-center flex flex-col items-center">
          <CipherRing theme={theme} />

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--bg-card)] shadow-sm text-xs text-[var(--fg-muted)] mb-8 animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <span className="w-2 h-2 rounded-full bg-green-400/80 animate-pulse" />
            Live on Starknet Sepolia
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif font-medium tracking-tight mb-6 leading-[1.05] animate-fade-up" style={{ animationDelay: '0.2s' }}>
            Private salaries on <br className="hidden sm:block" />
            <span className="font-serif italic font-normal text-[var(--brand)]">Starknet</span>
          </h1>

          <p className="text-lg md:text-xl text-[var(--fg-muted)] max-w-2xl mx-auto mb-12 leading-relaxed animate-fade-up" style={{ animationDelay: '0.3s' }}>
            Pay your team securely using zero-knowledge proofs. Salary amounts are hidden on-chain,
            verifiable by audits, and decrypted only by sender and recipient.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md mx-auto animate-fade-up" style={{ animationDelay: '0.4s' }}>
            <Link
              to="/employer/dashboard"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[var(--fg)] text-[var(--bg)] hover:opacity-90 px-8 py-4 rounded-full font-medium shadow-md transition-transform active:scale-95 text-base"
            >
              Start Paying <ArrowRight />
            </Link>
            <Link
              to="/employee/setup"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-[var(--fg)] px-8 py-4 rounded-full font-medium transition-colors active:scale-95 text-base shadow-sm"
            >
              Employee Setup
            </Link>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="w-full max-w-6xl mx-auto mt-40">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-serif font-medium tracking-tight mb-4 animate-fade-up" style={{ animationDelay: '0.5s' }}>
              The new standard for on-chain payroll
            </h2>
            <p className="text-[var(--fg-muted)] text-lg animate-fade-up" style={{ animationDelay: '0.55s' }}>
              Built for privacy-conscious organizations and DAOs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            <FeatureCard
              tag="01"
              delay="0.6s"
              isDark={theme === 'dark'}
              gradientLight="#EAE8E3 #E1DFD9"
              gradientDark="#353432 #3F3E3B"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              }
              bgIcon={
                <svg className="w-40 h-40 text-[var(--fg)]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-9a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V10a2 2 0 012-2h1V6a5 5 0 0110 0v2h1zm-6-5a3 3 0 00-3 3v2h6V6a3 3 0 00-3-3z" />
                </svg>
              }
              title="Encrypted Salaries"
              desc="Payments are executed with hidden values. The public ledger only shows commitments, keeping compensation completely confidential."
              footer={
                <span className="font-mono-accent text-xs text-[var(--fg-muted)] bg-[var(--bg-elevated)] inline-block px-3 py-1.5 rounded-lg border border-[var(--border)]">
                  <span className="opacity-60">data:</span> 0x***encrypted***
                </span>
              }
            />
            <FeatureCard
              tag="02"
              delay="0.7s"
              isDark={theme === 'dark'}
              gradientLight="#E6E8EF #EAE8E3"
              gradientDark="#3A3C45 #353432"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              bgIcon={
                <svg className="w-40 h-40 text-[var(--fg)]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              title="Audit Ready"
              desc="Generate view keys for auditors or compliance officers. Allow third parties to verify payroll without compromising employee privacy."
              footer={
                <span className="font-mono-accent text-xs text-[var(--fg-muted)] bg-[var(--bg-elevated)] inline-block px-3 py-1.5 rounded-lg border border-[var(--border)]">
                  generate_view_key()
                </span>
              }
            />
            <FeatureCard
              tag="03"
              delay="0.8s"
              isDark={theme === 'dark'}
              gradientLight="#EFE6E9 #EAE8E3"
              gradientDark="#453A3D #353432"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              bgIcon={
                <svg className="w-40 h-40 text-[var(--fg)]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              title="Any ERC-20 Token"
              desc="Pay in USDC, STRK, ETH, or your own governance token. Wrap tokens into confidential equivalents seamlessly."
              footer={
                <div className="flex gap-2">
                  {['USDC', 'STRK', 'ETH'].map(t => (
                    <span key={t} className="font-mono-accent text-[11px] text-[var(--fg-muted)] bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg border border-[var(--border)]">
                      {t}
                    </span>
                  ))}
                </div>
              }
            />
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full py-10 mt-auto z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-80">
            <ShieldIcon className="w-[18px] h-[18px]" />
            <span className="font-serif font-medium text-base">StealthPay</span>
          </div>
          <p className="text-sm text-[var(--fg-muted)]">
            Built on <a href="https://www.starknet.io" target="_blank" rel="noopener noreferrer" className="text-[var(--fg)] font-medium hover:text-[var(--brand)] transition-colors">Starknet</a> with <a href="https://docs.tongo.cash/protocol/introduction.html" target="_blank" rel="noopener noreferrer" className="text-[var(--fg)] font-medium hover:text-[var(--brand)] transition-colors">Tongo Protocol</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
