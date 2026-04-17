/**
 * REST client for Negotiation Service.
 * All public state goes through these functions — no raw fetch elsewhere.
 *
 * Env vars:
 *   NEXT_PUBLIC_NEGOTIATION_SERVICE_URL  — defaults to http://localhost:3001
 *   NEXT_PUBLIC_MOCK_TEE_PUBKEY          — if set, /tee-pubkey falls back to this
 */
import type {
  DealId,
  GetStatusResponse,
  GetTeePubkeyResponse,
  ListingId,
  PostListingRequest,
  PostListingResponse,
  PostOfferRequest,
  PostOfferResponse,
} from '@haggle/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BASE_URL =
  process.env.NEXT_PUBLIC_NEGOTIATION_SERVICE_URL ?? 'http://localhost:3001';

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── TEE pubkey ──────────────────────────────────────────────────────────────

async function fetchTeePubkey(): Promise<GetTeePubkeyResponse> {
  try {
    return await fetchJSON<GetTeePubkeyResponse>('/tee-pubkey');
  } catch {
    const mockPubkey = process.env.NEXT_PUBLIC_MOCK_TEE_PUBKEY;
    if (mockPubkey) {
      return {
        pubkey: mockPubkey as `0x${string}`,
        enclaveId: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        modelId: 'mock/demo@v0',
        signerAddress: '0x0000000000000000000000000000000000000000',
        whitelistedAt: 0,
      };
    }
    throw new Error('TEE pubkey unavailable and NEXT_PUBLIC_MOCK_TEE_PUBKEY not set');
  }
}

export function useTeePubkey() {
  return useQuery({
    queryKey: ['tee-pubkey'],
    queryFn: fetchTeePubkey,
    staleTime: 5 * 60 * 1000, // cache 5 min
    retry: 2,
  });
}

// ─── Listings ─────────────────────────────────────────────────────────────────

export async function postListing(body: PostListingRequest): Promise<PostListingResponse> {
  return fetchJSON<PostListingResponse>('/listing', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function usePostListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postListing,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}

export async function fetchListing(listingId: ListingId) {
  return fetchJSON<{
    id: ListingId;
    seller: `0x${string}`;
    askPrice: string;
    requiredKarmaTier: 0 | 1 | 2 | 3;
    itemMeta: {
      title: string;
      description: string;
      category: string;
      images: string[];
    };
    status: string;
    createdAt: number;
  }>(`/listing/${listingId}`);
}

export function useListing(listingId: ListingId | null) {
  return useQuery({
    queryKey: ['listing', listingId],
    queryFn: () => fetchListing(listingId!),
    enabled: listingId !== null,
  });
}

// ─── Offers ───────────────────────────────────────────────────────────────────

export async function postOffer(body: PostOfferRequest): Promise<PostOfferResponse> {
  return fetchJSON<PostOfferResponse>('/offer', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function usePostOffer() {
  return useMutation({
    mutationFn: postOffer,
  });
}

// ─── Negotiation status ───────────────────────────────────────────────────────

export async function fetchNegotiationStatus(negotiationId: DealId): Promise<GetStatusResponse> {
  return fetchJSON<GetStatusResponse>(`/status/${negotiationId}`);
}

export function useNegotiationStatus(
  negotiationId: DealId | null,
  options?: { enabled?: boolean; refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: ['negotiation-status', negotiationId],
    queryFn: () => fetchNegotiationStatus(negotiationId!),
    enabled: negotiationId !== null && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval ?? 1000,
    refetchIntervalInBackground: false,
  });
}
