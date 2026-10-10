import Link from "next/link";
import { JudgeCard } from "@/components/JudgeCard";
import { Wordmark } from "@/components/Wordmark";
import { addresses, addressUrl } from "@/lib/chain";

const REAL = [
  ["Calls of dibs, payments, ghost forfeits, withdrawals", "live on Monad testnet (chain 10143)"],
  ["Buyer record (paid on time / ghosted)", "live on chain: kept by the DropHouse contract from its own outcomes"],
  ["Money", "tINR, a test token the app mints — no real rupees"],
  ["Store", "a labelled demo store; piece pictures are illustrations"],
  ["Bot round", "100 scripted wallets, labelled “Bot round — synthetic”"],
  ["Instagram", "not integrated; the link is what a seller would put in a story"],
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[960px] flex-col gap-8 px-5 py-8">
      <header className="flex items-center justify-between">
        <Wordmark size={40} />
        <span className="rounded-full bg-surface-1 px-3 py-1 text-sm text-ink-muted">Monad testnet</span>
      </header>
      <section className="flex flex-col gap-4">
        <h1 className="display m-0 text-[clamp(28px,5vw,48px)] leading-[1.05]">A &ldquo;BOOK&rdquo; comment with a deposit behind it.</h1>
        <p className="m-0 max-w-[680px] text-lg text-ink-muted">
          Instagram sellers lose drops to buyers who comment BOOK and vanish. On Dibs, calling dibs puts down a deposit. Ghost, and it pays the
          seller while the piece moves to the next buyer. Every outcome goes on your record, which every Dibs store reads and no store can edit:
          pay on time and your deposit halves everywhere; ghost and it doubles.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/board/latest" className="sticker flex h-14 items-center px-7 text-lg no-underline">
            Open the live board
          </Link>
          <Link href="/d/latest" className="flex h-14 items-center rounded-full bg-surface-1 px-6 font-semibold no-underline">
            Join on your phone
          </Link>
          <Link href="/seller/latest" className="flex h-14 items-center rounded-full bg-surface-1 px-6 font-semibold no-underline">
            Seller view
          </Link>
          <a href="https://github.com/itssaharsh/dibs" className="flex h-14 items-center rounded-full bg-surface-1 px-6 font-semibold no-underline">
            View source
          </a>
        </div>
      </section>
      <section className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="label-caps m-0 text-sm">Judge it in 90 seconds</h2>
          <JudgeCard />
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="label-caps m-0 text-sm">What&apos;s real, what&apos;s simulated</h2>
          <dl className="m-0 flex flex-col gap-2 text-[15px]">
            {REAL.map(([k, v]) => (
              <div key={k} className="perf pt-2">
                <dt className="font-semibold">{k}</dt>
                <dd className="m-0 text-ink-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <footer className="text-sm text-ink-muted">
        Contracts:{" "}
        <a href={addressUrl(addresses.dropHouse)} className="mono">DropHouse</a> ·{" "}
        <a href={addressUrl(addresses.token)} className="mono">tINR</a> ·{" "}
        <a href={addressUrl(addresses.funder)} className="mono">Funder</a> — verified on MonadVision. Test money only.
      </footer>
    </main>
  );
}
