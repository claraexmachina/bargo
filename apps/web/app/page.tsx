import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center gap-8 py-12">
      {/* Hero */}
      <div className="space-y-4">
        <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary font-medium">
          TEE × Status Network × NEAR AI
        </div>

        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="text-primary">H</span>aggle
        </h1>

        <p className="text-xl font-medium text-foreground max-w-[380px]">
          내 봇이 상대방 봇이랑 협상.
          <br />
          가격도, 만남 조건도, 다.
        </p>

        <p className="text-sm text-muted-foreground max-w-[340px]">
          양측 예약가 비공개 · TEE 보안 · 자연어 조건 · Karma 신뢰
        </p>
      </div>

      {/* Pain → solution stats */}
      <div className="flex gap-6 text-center">
        <div>
          <p className="text-2xl font-bold text-destructive">23개</p>
          <p className="text-xs text-muted-foreground">평균 메시지 / 거래</p>
        </div>
        <div className="w-px bg-border" />
        <div>
          <p className="text-2xl font-bold text-destructive">3.4일</p>
          <p className="text-xs text-muted-foreground">평균 거래 기간</p>
        </div>
        <div className="w-px bg-border" />
        <div>
          <p className="text-2xl font-bold text-primary">5초</p>
          <p className="text-xs text-muted-foreground">Bargo 협상 시간</p>
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Button asChild size="lg" className="flex-1">
          <Link href="/listings">시작하기 →</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="flex-1">
          <Link href="/listings/new">매물 등록</Link>
        </Button>
      </div>

      {/* How it works */}
      <div className="w-full max-w-sm space-y-3 text-left mt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
          작동 방식
        </p>
        {[
          { icon: '🔐', title: '비공개 가격 입력', desc: 'NEAR AI TEE 보호 + 거래 완료 시 자동 삭제. 상대방은 절대 볼 수 없습니다.' },
          { icon: '🤖', title: 'TEE 안에서 협상', desc: 'NEAR AI Cloud TEE의 qwen3-30b LLM이 조건 파싱, ZOPA 알고리즘으로 가격 합의' },
          { icon: '⛓️', title: '온체인 에스크로', desc: 'Status Network 가스리스 tx, Karma 신뢰, 만남 QR 인증' },
        ].map((step) => (
          <div key={step.title} className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden="true">{step.icon}</span>
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
