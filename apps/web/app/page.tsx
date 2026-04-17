import { PixelCat } from '@/components/PixelCat';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-10 py-4 md:py-8">
      <main className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-8 lg:gap-12 items-start">
        {/* -------- LEFT: Hero -------- */}
        <section className="flex flex-col gap-8">
          <div>
            <span className="hero-tag">Peer-to-peer barter bot</span>
            <h1 className="mt-5 font-mono text-4xl sm:text-5xl lg:text-6xl font-black uppercase leading-[1.05] tracking-tight">
              Two cats.
              <br />
              One{' '}
              <span className="bg-bargo-accent border-4 border-bargo-ink px-2 inline-block shadow-pixel-sm">
                fair
              </span>{' '}
              deal.
            </h1>
            <p className="mt-6 text-base sm:text-lg max-w-lg leading-relaxed">
              Leave the awkward price-pinging to your pixel cat. It barters with theirs inside a
              sealed TEE — you only show up once the meetup is locked.
            </p>
          </div>

          {/* Cat barter scene */}
          <div className="pixel-box bg-bargo-mint h-72 sm:h-80 p-6 relative overflow-hidden">
            <div className="absolute top-3 left-3 pixel-pill bg-bargo-ink text-bargo-white border-bargo-ink">
              <span className="h-1.5 w-1.5 bg-bargo-accent" />
              Live trade
            </div>
            <div className="absolute top-3 right-3 font-mono text-[10px] uppercase tracking-widest opacity-70">
              zone: TEE-01
            </div>

            <div className="h-full flex items-center justify-center gap-3 sm:gap-6">
              {/* Seller cat */}
              <div className="flex flex-col items-center gap-2 animate-bounce-left">
                <div className="pixel-box-soft bg-bargo-white p-2 text-[9px] font-mono uppercase font-bold">
                  “700k ok?”
                </div>
                <PixelCat role="seller" className="w-24 h-24 sm:w-28 sm:h-28 drop-shadow-[3px_3px_0_#353B51]" />
                <span className="pixel-pill">Seller</span>
              </div>

              {/* Swap arrows */}
              <div className="flex flex-col items-center gap-2 animate-pixel-float">
                <div className="font-pixel text-[10px] text-bargo-ink">BARGO!</div>
                <div className="flex flex-col gap-1 font-mono text-bargo-ink text-lg leading-none">
                  <span>→</span>
                  <span>←</span>
                </div>
                <div className="w-6 h-6 bg-bargo-accent border-2 border-bargo-ink" />
              </div>

              {/* Buyer cat */}
              <div className="flex flex-col items-center gap-2 animate-bounce-right">
                <div className="pixel-box-soft bg-bargo-soft p-2 text-[9px] font-mono uppercase font-bold">
                  “750k?”
                </div>
                <PixelCat role="buyer" className="w-24 h-24 sm:w-28 sm:h-28 drop-shadow-[3px_3px_0_#353B51]" />
                <span className="pixel-pill bg-bargo-soft">Buyer</span>
              </div>
            </div>

            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between font-mono text-[10px]">
              <span className="uppercase tracking-widest opacity-70">meet @ Seoul Stn.</span>
              <span className="uppercase tracking-widest font-bold">→ 725,000 KRW</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button asChild size="lg">
              <Link href="/listings">Browse market →</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/listings/new">Post an item</Link>
            </Button>
          </div>
        </section>

        {/* -------- RIGHT: Dashboard column -------- */}
        <section className="flex flex-col gap-6">
          {/* Terminal demo window */}
          <div className="demo-window h-56 sm:h-60">
            <div className="flex justify-between border-b border-green-900 pb-1 mb-3 opacity-70 text-[11px]">
              <span>NEGOTIATION_LOG.SH</span>
              <span>TEE-SECURE-v1</span>
            </div>
            <div className="space-y-0.5 text-[13px]">
              <div>{'>'} booting TEE enclave ...</div>
              <div>{'>'} NEAR AI cloud connected [SECURE]</div>
              <div className="text-yellow-300">{'>'} seller-cat floor: 700,000 KRW</div>
              <div className="text-pink-300">{'>'} buyer-cat ceiling: 750,000 KRW</div>
              <div>{'>'} running ZOPA ...</div>
              <div className="text-white">{'>'} AGREED: 725,000 KRW · Seoul Stn · 7pm</div>
              <div className="opacity-70">{'>'} escrow locked :: 0x7f..a9</div>
              <span className="inline-block w-2 h-3.5 bg-green-400 align-middle animate-pulse" />
            </div>
          </div>

          {/* 3-step cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                title: 'Set floor',
                desc: 'Whisper your bottom line in plain English. It lives only inside the TEE.',
              },
              {
                title: 'Cats barter',
                desc: 'Both cats swap offers in private. Neither sees the other’s real number.',
                highlight: true,
              },
              {
                title: 'Meet IRL',
                desc: 'On-chain escrow locks. Tap confirm when you meet — funds release instantly.',
              },
            ].map((step, i) => (
              <div
                key={step.title}
                className={`pixel-box p-4 ${step.highlight ? 'bg-bargo-soft' : 'bg-bargo-white'}`}
              >
                <div className="flex items-baseline justify-between border-b-2 border-bargo-ink pb-2 mb-3">
                  <h3 className="font-mono font-black text-xs uppercase tracking-wider">
                    {step.title}
                  </h3>
                  <span className="font-mono text-[10px] opacity-60">0{i + 1}</span>
                </div>
                <p className="text-xs leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

          {/* 2x2 value grid */}
          <div className="pixel-dash grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              {
                glyph: '▮▯',
                title: 'Zero chat stress',
                desc: '23 back-and-forth messages? Done in ~5 seconds flat.',
              },
              {
                glyph: '◆',
                title: 'Sealed by design',
                desc: 'Even the operator cannot read your real reservation price.',
              },
              {
                glyph: '★',
                title: 'Karma trust',
                desc: 'Well-behaved cats earn higher tiers and better matches.',
              },
              {
                glyph: '⚡',
                title: 'Gasless settle',
                desc: 'Status Network foots the gas. Clean hand-off, no surprises.',
              },
            ].map((v) => (
              <div key={v.title} className="flex gap-3 items-start">
                <div className="w-10 h-10 bg-bargo-soft border-2 border-bargo-ink flex items-center justify-center shrink-0 font-mono text-base">
                  {v.glyph}
                </div>
                <div>
                  <h4 className="font-mono font-black text-xs uppercase tracking-wider">
                    {v.title}
                  </h4>
                  <p className="text-xs leading-snug mt-1 opacity-80">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Bottom stats band */}
      <section className="pixel-box bg-bargo-white p-6 grid grid-cols-3 divide-x-4 divide-bargo-ink">
        {[
          { value: '23', label: 'avg msgs / deal' },
          { value: '3.4d', label: 'avg deal time' },
          { value: '5s', label: 'with Bargo', accent: true },
        ].map((s) => (
          <div key={s.label} className="text-center px-2">
            <p
              className={`font-mono text-3xl sm:text-4xl font-black ${
                s.accent ? 'text-bargo-ink bg-bargo-accent inline-block px-2' : 'text-bargo-ink'
              }`}
            >
              {s.value}
            </p>
            <p className="text-[10px] sm:text-xs mt-2 font-mono uppercase tracking-wider opacity-70">
              {s.label}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
