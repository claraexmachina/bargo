# Haggle — Team Composition & PRD (v2)

> **에이전트가 봇과 협상하는 P2P 마켓플레이스**
> Powered by NEAR AI Cloud TEE × Status Network
>
> *"한국인이 가장 싫어하는 일 하나 자동화."*

> **v2 변경사항** (트랙 평가 기준 보완):
> - TEE 안에 **LLM 추론 추가** (NEAR AI 트랙의 "AI 인프라 필연성" 충족)
> - **Karma 깊이 통합** (티어별 throughput + 고가 매물 게이팅) — Status Network 25% 평가
> - **RLN 사용처 명시** (협상 메시지 rate-limit)
> - **BNB 옵션 트랙** 자격 확보 가이드 추가

---

## Part 1. 팀 구성 (4명 권장, 3명 가능)

시니어급 역할 분담. 각자 소유권 명확히, 인터페이스는 Day 0에 계약처럼 고정.

| # | 역할 | 책임 영역 | 핵심 산출물 | 차단자(blocker) 방지 전략 |
|---|---|---|---|---|
| 1 | **TEE/Agent Lead** (백엔드 + AI) | NEAR AI Cloud TEE 환경 구성, **LLM 통합**, 협상 알고리즘, attestation 파이프라인 | TEE 서비스 + LLM 추론 + 검증 가능한 attestation | Day 0에 mock TEE endpoint 먼저 배포해서 FE/컨트랙트 unblock |
| 2 | **Smart Contract Lead** (Solidity) | Escrow, Karma reader (티어 기반 게이팅 포함), attestation verifier, 이벤트 설계 | Hoodi 배포 컨트랙트 주소 + ABI | ABI Day 0 확정, testnet에 stub 먼저 배포 |
| 3 | **Frontend Lead** (Next.js + wagmi/viem) | 양측 플로우 (등록·협상·에스크로·만남 인증), 자연어 조건 입력 UI, 데모 시연 UI | 모바일 웹앱 (PWA) + 2폰 동시 시연 | Mock API로 FE부터 완성, 실배선은 Day 2 |
| 4 | **Product/Demo Lead** (옵션, 강력 권장) | 문서, 덱, 데모 영상 촬영·편집, 시나리오 스크립팅, 트윗 | 3분 영상, 10슬라이드 덱, 제출물 | Day 1부터 초안 작성 시작 (마지막날 폭발 방지) |

**3인으로 갈 경우**: FE Lead가 Demo Lead 겸임. 단 영상·덱은 수상에 치명적이라 한 명이라도 하루는 여기에 올인할 것.

**팀 계약 (Day 0, 30분)**:
- ABI 인터페이스 확정 → 이후 변경은 전원 동의 필요
- Git flow: `main` 보호, feature branch + PR, 리뷰는 5분 이내
- Stand-up: 12시간 주기 — 블로커 공유만
- 공유 Notion: PRD, ABI, 배포 주소, 환경변수, 데모 스크립트 한 페이지

---

## Part 2. PRD

### 2.1 Problem Statement

P2P 중고거래 협상은 **정보 비대칭** 때문에 비효율적이다.
- 양쪽 모두 reservation price를 먼저 드러내기 싫어함
- 가격뿐 아니라 만남 장소·시간·결제·픽업 방식까지 모든 조건을 메시지로 협상
- 결과: 평균 23개 메시지 / 거래, 성사율 낮음, 노쇼 빈번

**Insight**: 협상은 *알고리즘적으로 풀 수 있는 문제*지만, 양측이 자기 정보를 신뢰할 수 있는 중립자에게 맡길 수 없어서 안 풀린다. **TEE가 그 중립자, LLM이 자유 조건의 통역자.**

### 2.2 Goals (해커톤 범위)

| G# | 목표 | 측정 기준 |
|---|---|---|
| G1 | 양측 reservation price 비공개 협상 체결 | TEE attestation 포함된 합의 이벤트 1회 성공 |
| G2 | **TEE 안에서 LLM 추론** | 자연어 조건 ("강남 직거래만, 박스 있는 것만") → 구조화 제약 변환 1회 성공, attestation에 model_id 포함 |
| G3 | 가스리스 에스크로 거래 성사 | Hoodi testnet에 가스리스 tx 5회 이상 |
| G4 | **Karma 티어 기반 throughput·게이팅** | Tier 0 사용자는 동시 3개 협상 한도, Tier 2+만 50만원+ 매물 오퍼 가능 — 컨트랙트로 강제 |
| G5 | **RLN으로 협상 트리거 rate-limit** | 동일 매물에 대한 오퍼 제출 시 RLN proof 첨부, epoch당 N회 초과 시 거부 |
| G6 | 라이브 데모 (폰 2대) | 3분 내 end-to-end 시연 |

### 2.3 Non-Goals (명시적으로 안 함)

- 실제 결제 연동 (카드·계좌) — 에스크로는 testnet 토큰
- 카톡/당근 통합 — 독립 웹앱
- 여러 카테고리 — 중고거래 1개만, 매물은 2~3개 mock
- 모바일 네이티브 앱 — PWA로 충분
- 멀티턴 자유 협상 — LLM은 **조건 파싱과 매칭만** (대화는 안 함)
- 프로덕션 보안 감사 수준 — 데모 목적

### 2.4 User Stories & 합격 기준

**US-1: 판매자 매물 등록 (가격 + 자연어 조건)**
> 판매자는 매물 정보, 희망가, 최저가(비공개), **자연어 조건**(예: *"강남/송파 직거래만, 평일 19시 이후, 박스 없음"*)을 입력하고 리스팅을 발행한다.

Acceptance:
- [ ] 최저가 + 자연어 조건은 plaintext로 HTTPS 전송; 서비스는 합의 후 자동 purge
- [ ] 상대방에게 절대 노출 안 됨 (API response에 plaintext 필드 없음)
- [ ] 리스팅 ID가 온체인 이벤트로 발행

**US-2: 구매자 오퍼 (가격 + 자연어 조건)**
> 구매자는 매물을 보고 희망가, 최대가(비공개), 자연어 조건(예: *"강남 가능, 토요일만 됨, 카드결제 가능"*)을 입력하여 협상을 트리거한다.

Acceptance:
- [ ] 최대가 + 자연어 조건은 plaintext로 HTTPS 전송; 서비스는 합의 후 자동 purge. on-chain offerId 필수 첨부
- [ ] **RLN proof 첨부** (sybil 봇 방지)
- [ ] **사용자 Karma 티어 ≥ 매물 요구 티어** 컨트랙트가 검증 (요구 티어 미달 시 reverts)
- [ ] 트리거 시 서비스가 NEAR AI TEE로 양측 plaintext 전달 (직접 전달, 암호화 불필요)
- [ ] 15초 이내 결과 반환 (LLM 호출 포함)

**US-3: TEE 협상 (LLM + ZOPA)**
> TEE 안에서 LLM이 양측 자연어 조건을 파싱·매칭하고, ZOPA 알고리즘으로 가격을 합의한다. attestation 발행.

Acceptance:
- [ ] LLM이 자연어 → 구조화 제약 변환 (지역·시간·결제·기타 4개 축)
- [ ] **조건 호환성 검증**: 한쪽이라도 조건 불일치면 협상 실패 (예: 판매자 평일만 / 구매자 주말만)
- [ ] 가격 ZOPA 존재 시 합의가 = 가중평균 (Karma 티어 가중)
- [ ] attestation에 (listing_id, offer_id, agreed_price, agreed_meet_time, agreed_location, model_id, enclave_id, ts) 서명
- [ ] 양측 reservation price·자연어 원문은 attestation·로그·서명 어디에도 노출 X

**US-4: 가스리스 에스크로 정산**
> 합의 시 구매자가 에스크로에 락업, 만남 인증 후 판매자에게 릴리즈.

Acceptance:
- [ ] 구매자 가스비 0 (Status Network 가스리스 검증)
- [ ] TEE attestation을 컨트랙트가 검증 (서명 + enclave_id 화이트리스트)
- [ ] 양측 "만남 완료" 서명 → 릴리즈

**US-5: Karma 통합 (티어 throughput + 게이팅 + 패널티)**
> Karma는 단순 표시가 아니라 **3가지 메커니즘**으로 동작.

Acceptance:
- [ ] **티어별 동시 협상 한도**: Tier 0=3, Tier 1=10, Tier 2=20, Tier 3=무제한 — 컨트랙트가 강제 (sybil 봇 방지)
- [ ] **티어 게이팅**: 50만원+ 매물은 Tier 2+만 오퍼 가능
- [ ] **티어 가중 합의가**: 같은 ZOPA에서 높은 Karma 측에 ~5% 유리한 분할 (ex: Tier 3 판매자 vs Tier 0 구매자 → 60:40)
- [ ] **노쇼 페널티**: 만남 미인증 시 onchain 이벤트 → Karma 하락 (Status Network 메커니즘 트리거)
- [ ] 리스팅·오퍼 페이지에 상대방 Karma 티어 표시

**US-6: RLN 협상 rate-limit**
> 동일 매물에 대한 오퍼 제출 시 RLN proof 필수, epoch당 사용자당 N회 초과 시 nullifier 노출되어 차단.

Acceptance:
- [ ] 오퍼 제출 페이로드에 RLN proof 포함
- [ ] 컨트랙트 또는 서비스가 RLN nullifier 검증
- [ ] epoch당 매물별 최대 3회 오퍼 (스팸·가격 탐색 봇 차단)
- [ ] 익명성 유지: 정상 사용자의 오퍼 빈도 패턴이 협상 서비스에 노출 안 됨

### 2.5 Success Metrics (데모 당일)

- [ ] end-to-end 한 사이클 3분 안에 완주
- [ ] 두 폰 화면에서 reservation price·자연어 조건 원문 노출 0회
- [ ] Hoodi에 트랜잭션 5개+
- [ ] TEE attestation 온체인 검증 성공
- [ ] **LLM 조건 매칭 데모**: 시간·장소 조건 충돌 케이스 1회 시연 ("협상 실패: 시간 조건 불일치")
- [ ] **Karma 티어 차이 데모**: Tier 0 사용자가 50만원+ 매물에 오퍼 시도 → 컨트랙트 거부 시연

---

### 2.6 시스템 아키텍처 (V2)

```
┌────────────────────────────────────────────────────────────┐
│                Haggle PWA (Next.js, wagmi)                 │
│  Seller View │ Listings │ Offer View │ Meetup Confirmation │
└─────┬───────────────────────────────────────┬──────────────┘
      │ HTTPS (plaintext DTOs)                │ RPC (gasless)
      │                                       │
┌─────▼──────────────────────┐   ┌────────────▼─────────────┐
│  Negotiation Service        │   │  Status Network Hoodi    │
│  (Node.js / Fastify)        │   │                          │
│  - Listing/Offer registry   │   │  HaggleEscrow.sol        │
│  - RLN nullifier check      │   │   ├── registerListing()  │
│  - negotiate/engine.ts      │   │   ├── submitOffer()      │
│  - Auto-purge plaintext     │   │   │   (Karma gate +      │
│    on COMPLETED             │   │   │    RLN verify)       │
└─────┬──────────────────────┘   │   ├── settleNegotiation()│
      │ HTTPS /v1/chat/completions│   │   (relayer-only)     │
┌─────▼──────────────────────┐   │   ├── lockEscrow()       │
│  NEAR AI Cloud TEE         │   │   ├── confirmMeetup()    │
│  (Intel TDX + NVIDIA GPU)  │   │   └── reportNoShow()     │
│  qwen3-30b LLM             │   │                          │
│  GET /v1/attestation/report│   │  KarmaReader.sol         │
│  → TDX quote + GPU evidence│   │  RLNVerifier.sol         │
└─────┬──────────────────────┘   └──────────────────────────┘
      │ nearAiAttestationHash
┌─────▼──────────────────────┐
│  chain/relayer.ts          │
│  settleNegotiation(        │
│    listingId, offerId,     │
│    agreedPrice,            │
│    agreedConditionsHash,   │
│    nearAiAttestationHash)  │
└────────────────────────────┘
```

**경계·계약**:
- **PWA ↔ Negotiation Service**: REST 5개 (`POST /listing`, `POST /offer` (RLN proof 포함), `GET /status/:id`, `GET /attestation/:dealId`, `POST /attestation-receipt`). `GET /tee-pubkey` **삭제됨** (V1 artifact).
- **Service ↔ NEAR AI**: OpenAI SDK, `cloud-api.near.ai/v1`, model `qwen3-30b`, `response_format: json_schema strict: true`.
- **Relayer → Contract**: `settleNegotiation(listingId, offerId, agreedPrice, agreedConditionsHash, nearAiAttestationHash)` — `onlyAttestationRelayer` modifier.
- **Contract ↔ Client**: 이벤트 `ListingCreated`, `OfferSubmitted`, `NegotiationSettled` (indexed `nearAiAttestationHash`), `EscrowLocked`, `MeetupConfirmed`, `NoShowReported`.

### 2.7 데이터 모델 (V2)

**Off-chain (Negotiation Service, SQLite)**:
```
Listing {
  id, seller, item_meta_json, ask_price,
  plaintext_min_sell TEXT,          -- NULLed on COMPLETED
  plaintext_seller_conditions TEXT, -- NULLed on COMPLETED
  required_karma_tier, status
}

Offer {
  id, listing_id, buyer, bid_price,
  plaintext_max_buy TEXT,           -- NULLed on COMPLETED
  plaintext_buyer_conditions TEXT,  -- NULLed on COMPLETED
  rln_nullifier, status
}

Negotiation {
  id, listing_id, offer_id,
  state,                            -- queued|running|agreement|fail|settled
  near_ai_attestation_hash,         -- keccak256(canonical(bundle))
  agreed_conditions_hash,           -- keccak256(canonical(agreedConditions))
  agreed_conditions_json,
  agreed_price,
  model_id,                         -- "qwen3-30b"
  completion_id,                    -- NEAR AI chat_completion_id
  attestation_bundle_path,          -- ./data/attestations/<dealId>.json
  onchain_tx_hash,
  failure_reason,
  settled_at
}

-- Auto-purge trigger (SQLite, fires on state → 'completed'):
-- UPDATE listings SET plaintext_min_sell=NULL, plaintext_seller_conditions=NULL WHERE id=?
-- UPDATE offers SET plaintext_max_buy=NULL, plaintext_buyer_conditions=NULL WHERE id=?
```

**On-chain (HaggleEscrow, V2)**:
```solidity
struct Listing {
  address seller;
  uint256 askPrice;
  uint8   requiredKarmaTier;
  bytes32 itemMetaHash;     // keccak256(JSON.stringify(itemMeta))
  uint64  createdAt;
  bool    active;
}

struct Deal {
  bytes32 listingId;
  bytes32 offerId;
  address seller;
  address buyer;
  uint256 agreedPrice;
  bytes32 agreedConditionsHash;   // keccak256(canonical(agreedConditions))
  bytes32 nearAiAttestationHash;  // keccak256(canonical(attestation bundle))
  DealState state;                // NONE|PENDING|LOCKED|COMPLETED|NOSHOW|REFUNDED
  uint64  createdAt;
  uint64  lockedUntil;
}
```

### 2.8 협상 알고리즘 (TypeScript, V2)

서비스에 `services/tee/` 디렉토리는 존재하지 않음. 협상은 `apps/negotiation-service/src/negotiate/engine.ts`에서 처리.

```ts
// negotiate/engine.ts (pseudocode)
async function runNegotiation(listing: Listing, offer: Offer): Promise<NegotiationResult> {
  // 1. ZOPA 사전 체크 (LLM 호출 전)
  if (BigInt(offer.plaintextMaxBuy) < BigInt(listing.plaintextMinSell)) {
    return { state: 'fail', failureReason: 'no_price_zopa' };
  }

  // 2. NEAR AI Cloud LLM 호출 — 자연어 조건 파싱
  const { conditions, completionId } = await nearAiClient.parseConditions({
    listingTitle: listing.itemMeta.title,
    sellerText: listing.plaintextSellerConditions,
    buyerText: offer.plaintextBuyerConditions,
    // response_format: json_schema strict: true
  });

  // 3. 조건 호환성 매칭
  const overlap = matchConditions(conditions.seller, conditions.buyer);
  if (!overlap.feasible) {
    return { state: 'fail', failureReason: 'conditions_incompatible' };
  }

  // 4. Karma 가중 가격 계산
  const agreedPrice = karmaWeight(
    listing.plaintextMinSell, offer.plaintextMaxBuy,
    listing.sellerKarmaTier, offer.buyerKarmaTier
  );

  // 5. NEAR AI attestation 가져오기
  const nonce = keccak256(concat([dealId, toHex(completionId)]));
  const bundle = await nearAiClient.fetchAttestation({ model: 'qwen3-30b', nonce, completionId });
  const nearAiAttestationHash = keccak256(canonicalize(bundle));

  // 6. 결과 저장 + relayer 트리거
  await relayer.settleNegotiation({ listingId, offerId, agreedPrice, agreedConditionsHash, nearAiAttestationHash });

  return { state: 'agreement', agreedPrice, agreedConditions: overlap, nearAiAttestationHash, modelId: 'qwen3-30b', completionId };
}
```

**보안 규칙**:
- `plaintextMinSell`, `plaintextMaxBuy`, 자연어 원문은 **로그 없음, API response 없음**
- 거래 완료 시 DB trigger + app-level 양쪽에서 자동 purge (심층 방어)
- `nearAiAttestationHash`만 on-chain에 기록 — full bundle은 `/attestation/:dealId` 엔드포인트로 제공

### 2.9 보안·위협 모델 (V2)

출처: `docs/threat-model.md` (권위 있는 V2 위협 모델).

| # | 공격자 | 능력 | 방어책 | 잔여 리스크 |
|---|---|---|---|---|
| 1 | 악의적 NEAR AI 운영자 | 추론 중 모델 교체; 임의 JSON 반환 | `signed_response`가 `model`, `nonce`, `completion_id` 바인딩. 검증기가 TDX measurement + NVIDIA NRAS GPU evidence 재확인. | Intel PCS 루트 서명 키 손상 (비현실적) |
| 2 | 악의적 서비스 운영자 | 라이브 DB 읽기; plaintext reservation price 추출 | Plaintext는 오퍼 수신 ~ 정산(~15초) 동안만 DB에 존재. `COMPLETED` 시 auto-purge. | 사전 정산 스누핑 가능 — **정직하게 잔여 리스크로 문서화** |
| 3 | 거래 상대방 | 상대방 예약가 또는 조건 원문 탈취 | `/status/:id`는 `agreedPrice` + `AgreedConditions`(합의 결과)만 반환. 예약가는 어떤 API에도 노출 없음. | 사용자가 조건 텍스트에 가격 포함 — UI 경고로 완화 |
| 4 | 체인 관찰자 | 다른 `dealId`에 오래된 `nearAiAttestationHash` 재사용 | `nonce = keccak256(dealId ‖ completion_id)` attestation에 내장. 검증기 step 2가 재파생 확인. | attestation은 해당 X에만 유효; Y에 replay 시 nonce 체크 실패 |
| 5 | DB 침해 (정산 전) | 활성 협상 SQLite 파일 전체 유출 | 미정산 건당 최대 1행의 plaintext 노출. 완료된 거래는 이미 purge. | **클라이언트 암호화 제거의 정직한 트레이드오프로 수용.** 사후: SQLCipher |
| 6 | DB 침해 (정산 후) | 모든 거래 정산 후 SQLite 파일 전체 유출 | 예약가 데이터 없음 (NULL 컬럼). 정산 사실, attestation 해시, 합의 조건만 저장. | 없음 |
| 7 | Relayer 키 유출 | `settleNegotiation` 임의 값으로 호출 | 위조 정산은 구매자가 정확한 `agreedPrice`로 `lockEscrow`를 호출하기 전까지 에스크로 없음. on-chain 검증기 FAIL. | `setAttestationRelayer` owner-only rotation. 사후: multisig |
| 8 | NEAR AI 다운타임 | 서비스가 추론 완료 불가 | 12초 요청 예산; `failureReason: 'llm_timeout'` 반환. 무음 실패 없음. | 사용자 재시도 또는 취소. V2에 fallback LLM 없음 (정직) |
| 9 | NEAR AI JSON 오출력 | LLM이 스키마 미준수 구조화 출력 반환 | `response_format: json_schema strict: true` 소스에서 거부. 2차 zod 검증이 `llm_timeout`으로 처리. | 없음 |
| 10 | RLN sybil (스팸 오퍼) | 대량 지갑으로 오퍼 스팸 | `MAX_PER_EPOCH = 3` per `(nullifier, epoch)`. Karma tier gate는 고가 매물에 SNT 스테이킹 필요. | Tier 0 사용자는 다중 지갑 생성 가능, but Karma는 경제적 비용 발생 |

**데모 멘트**:
> *"우리(운영자)는 협상 ~15초 동안 예약가를 볼 수 있습니다. 이것이 V2의 정직한 신뢰 모델입니다. 거래 완료 즉시 DB에서 자동 삭제됩니다. NEAR AI TEE 추론은 심사위원이 직접 verify-attestation.mjs로 검증할 수 있습니다."*

### 2.10 타임라인 (48시간)

**T+0 ~ T+4h — Kickoff**
- PRD·ABI·환경변수 확정
- 각자 환경 셋업
- Hoodi faucet, NEAR AI Cloud API key 확보
- **게이트**: TEE에서 "hello world" 응답 + LLM 1회 호출 성공

**T+4h ~ T+18h — 병렬 구현**
- TEE: `negotiate()` 함수 + LLM 조건 파싱 + attestation 서명
- Contract: Escrow + KarmaReader + RLNVerifier 배포 (stub)
- FE: 매물 등록 (자연어 조건 입력 UI 포함) + 리스팅 목록
- **게이트**: TEE 단독으로 가짜 입력 받아 합의 결과 반환 가능

**T+18h ~ T+34h — 통합 + Karma·RLN 강제**
- 실제 배선 (mock → 실 TEE/컨트랙트)
- Karma 티어 throughput + 게이팅을 컨트랙트가 강제하는지 검증
- RLN proof 첨부·검증 흐름 통합
- **게이트**: end-to-end 1회 + Karma 거부 1회 + 조건 불일치 1회 모두 동작

**T+34h ~ T+44h — 데모·버그**
- 데모 시나리오 리허설 (폰 2대 실촬)
- 영상 촬영·편집, 덱 완성

**T+44h ~ T+48h — 제출·버퍼**
- README, 환경변수 제거, 배포 주소 문서화
- 트윗, 라이브 데모 링크 점검

### 2.11 Risk Register

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| NEAR AI Cloud TEE 셋업 지연 | 높음 | 높음 | Day 0 최우선, mock TEE fallback |
| **TEE 안 LLM 추론 지연/실패** | 중 | 높음 | OpenAI SDK 호환 확인, 작은 모델로 시작, 응답시간 < 10s 목표 |
| Status Network 가스리스 오설정 | 중 | 높음 | Scaffold-ETH extension 기반, Discord @yjkellyjoo 대기 |
| **RLN 통합 복잡도** | 높음 | 중 | 정교한 ZK proof 대신 Status Network 제공 SDK 활용, 안 되면 nullifier 모킹 + 덱 명시 |
| **Karma 티어 throughput 컨트랙트 복잡도** | 중 | 중 | 단순 카운터로 시작, decrement 로직만 잘 짜기 |
| 라이브 데모 실패 | 중 | 높음 | 영상 백업 |
| 컨디션 난조 | 높음 | 중 | 12h마다 4h 수면 |
| 스코프 크립 | 높음 | 높음 | Non-Goals 벽에 붙임 |

### 2.12 데모 시나리오 (3분)

**0:00~0:20 — 페인**
- 분할화면: 판매자 47개 카톡 / 구매자 답장 기다림
- 자막: *"한국인 평균 당근 거래당 메시지 23개, 평균 3.4일"*

**0:20~0:35 — 솔루션 한 줄**
- *"내 봇이 상대방 봇이랑 5초 만에 협상. 가격도, 만남 조건도, 다."*
- Haggle 로고

**0:35~1:50 — 라이브 데모 (폰 2대 실촬)**
- 판매자 화면:
  - "맥북 M1, 800K, 마지노선 700K (비공개)"
  - 자연어 입력: *"강남/송파 직거래만, 평일 19시 이후, 박스 없음"*
  - Karma Tier 3 표시
- 구매자 화면:
  - "최대 750K (비공개), 강남 가능, 토요일만"
  - Karma Tier 1 표시
- 5초 후 양쪽 알림: **"협상 실패 — 조건 불일치"** (시간 조건 충돌)
- 자막: *"가격이 맞아도 조건이 안 맞으면 합의 안 됨. 어느 조건이 충돌했는지조차 안 보입니다."*

**1:50~2:30 — 두 번째 시도**
- 구매자 조건 수정: *"평일 가능, 강남 가능, 카드/현금 모두 OK"*
- 5초 후 합의: **"725,000원, 강남역 8번출구 금요일 19:30"**
- 결정적 컷: *"판매자도 구매자도, 우리(운영자)조차 상대 마지노선·원본 조건은 모릅니다. TEE attestation에는 합의 결과만 서명됩니다."*

**2:30~2:50 — Karma·정산**
- Tier 0 사용자가 50만원+ 매물에 오퍼 시도 → **컨트랙트 거부** (자막: "신뢰 안 쌓인 봇은 고가 거래 못 함")
- QR로 만남 인증 → 가스리스 에스크로 릴리즈

**2:50~3:00 — 비전**
- *"중고거래에서 알바·월세·프리랜서 단가까지. 협상이 필요한 모든 곳에."*

### 2.13 제출물 체크리스트

- [ ] GitHub public repo, README
- [ ] 배포된 컨트랙트 주소 (Hoodi)
- [ ] (옵션) opBNB/BSC mirror 컨트랙트 주소 + tx 2개+ — BNB 트랙 자격
- [ ] 라이브 데모 URL
- [ ] 데모 영상 (3분 이하, 자막)
- [ ] 덱 (10 슬라이드)
- [ ] 트윗 (@BNBChain + #ConsumerAIonBNB) — BNB 트랙 시
- [ ] Ludium 포털 제출 (General Track) — 도전 시
- [ ] NEAR AI 트랙 제출
- [ ] Status Network 트랙 제출
- [ ] Builder Quest 체크리스트 (가스리스 배포, 5+ tx, Karma 표시·사용, 영상, README, 라이브 데모)

### 2.14 포스트 해커톤 로드맵

- **M0+2w**: 멀티턴 자유 협상 (LLM이 메시지 주고받음)
- **M0+1m**: 알바 시급·프리랜서 단가 카테고리
- **M0+2m**: 카카오톡 봇, 당근 크롤링 브릿지 PoC
- **M0+3m**: mainnet, 거래 수수료 0.5%

---

## Part 3. Day 0 킥오프 체크리스트

30분 안에 끝내세요:

1. 팀 Notion 한 페이지 (PRD 링크 + ABI + env)
2. GitHub org/repo 생성, 전원 access
3. 서비스 계정:
   - NEAR AI Cloud: API key + **LLM 모델 선택** (작고 빠른 것 추천)
   - Hoodi testnet: deployer wallet + faucet
   - (옵션) opBNB testnet: deployer wallet + faucet
   - Vercel 연결
4. ABI 고정 (Listing/Offer/Deal 구조체 + 함수 시그니처 + Karma·RLN 함수)
5. `.env.example` 작성
6. `main` 보호 + PR 5분 리뷰 룰
7. 데모 시나리오 대사까지 초안

---

## Part 4. 트랙 매핑 (v2)

| 트랙 | 컨셉 핏 | 충족 항목 | 평가 |
|---|---|---|---|
| **NEAR AI Cloud** | ★★★ | TEE + **LLM 추론** + attestation + model_id 핀 | "AI 인프라 필연성" 충족 |
| **Status Network** | ★★★ | 가스리스 + **Karma 깊이 통합** (티어 throughput·게이팅·가중 분할) + **RLN rate-limit** | 25% Karma 평가 항목 강함 |
| **BNB General** | ★★ (옵션) | opBNB에 mirror 컨트랙트 배포 + tx 2개+ + 트윗 | 자격만 챙기는 가벼운 도전 가능 |

**추천 전략**: NEAR AI + Status Network 듀얼 메인. BNB는 마지막 4시간에 mirror 컨트랙트 배포 + 트윗 1개로 자격만 확보 (작업량 ~1시간).

---

## Part 5. v2에서 추가된 핵심 변경사항 요약

| 변경 | 어디 영향 | 트랙 평가 보상 |
|---|---|---|
| TEE에 LLM 추론 추가 (자연어 조건 파싱·매칭) | US-1, US-2, US-3, 알고리즘, 데모 | NEAR AI Innovation 30% + Tech 20% |
| Karma 티어 throughput (동시 협상 한도) | US-5, 컨트랙트 | Status Karma 25% |
| Karma 티어 게이팅 (고가 매물 보호) | US-5, 컨트랙트 | Status Karma 25% |
| Karma 가중 합의가 (평판 보상) | 알고리즘 | Status Karma 25% |
| RLN proof 첨부·검증 | US-2, US-6, 서비스 | Status Privacy 30% |
| 조건 불일치 데모 케이스 | 데모 시나리오 | NEAR AI Privacy 15% (조건 원문도 노출 X) |
| BNB mirror 컨트랙트 가벼운 자격 확보 | Part 4 | BNB 트랙 진입 |
