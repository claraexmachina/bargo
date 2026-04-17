import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center gap-8 py-12">
      {/* Hero */}
      <div className="space-y-4">
        <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary font-medium">
          TEE × Status Network × NEAR AI
        </div>

        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="text-primary">B</span>argo
        </h1>

        <p className="text-xl font-medium text-foreground max-w-[380px]">
          Your bot negotiates with theirs.
          <br />
          Price, meetup conditions — everything.
        </p>

        <p className="text-sm text-muted-foreground max-w-[340px]">
          Private reservation prices · TEE security · Natural-language conditions · Karma trust
        </p>
      </div>

      {/* Pain → solution stats */}
      <div className="flex gap-6 text-center">
        <div>
          <p className="text-2xl font-bold text-destructive">23</p>
          <p className="text-xs text-muted-foreground">avg messages / deal</p>
        </div>
        <div className="w-px bg-border" />
        <div>
          <p className="text-2xl font-bold text-destructive">3.4 days</p>
          <p className="text-xs text-muted-foreground">avg deal duration</p>
        </div>
        <div className="w-px bg-border" />
        <div>
          <p className="text-2xl font-bold text-primary">5s</p>
          <p className="text-xs text-muted-foreground">Bargo negotiation time</p>
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Button asChild size="lg" className="flex-1">
          <Link href="/listings">Browse listings →</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="flex-1">
          <Link href="/listings/new">Create listing</Link>
        </Button>
      </div>

      {/* How it works */}
      <div className="w-full max-w-sm space-y-3 text-left mt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
          How it works
        </p>
        {[
          {
            icon: '🔐',
            title: 'Private reservation price',
            desc: 'Processed inside NEAR AI TEE. Auto-purged on deal completion. Counterparty never sees it.',
          },
          {
            icon: '🤖',
            title: 'Negotiating inside TEE',
            desc: 'NEAR AI Cloud qwen3-30b parses conditions and runs ZOPA algorithm to agree on price.',
          },
          {
            icon: '⛓️',
            title: 'On-chain escrow',
            desc: 'Status Network gasless tx, Karma trust scoring, meetup QR verification.',
          },
        ].map((step) => (
          <div key={step.title} className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden="true">
              {step.icon}
            </span>
            <div>
              <p className="font-medium text-sm">{step.title}</p>
              <p className="text-xs text-muted-foreground">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
