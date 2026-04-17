/**
 * REST client for Negotiation Service.
 * All public state goes through these functions — no raw fetch elsewhere.
 *
 * Env var:
 *   NEXT_PUBLIC_NEGOTIATION_SERVICE_URL  — defaults to http://localhost:3001
 */
import type {
  DealId,
  GetServicePubkeyResponse,
  GetStatusResponse,
  ListingId,
  ListingPublic,
  NearAiAttestationBundle,
  PostListingRequest,
  PostListingResponse,
  PostOfferRequest,
  PostOfferResponse,
} from '@bargo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const BASE_URL = process.env.NEXT_PUBLIC_NEGOTIATION_SERVICE_URL ?? 'http://localhost:3001';

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

// ─── Service encryption pubkey ────────────────────────────────────────────────

export async function fetchServicePubkey(): Promise<GetServicePubkeyResponse> {
  return fetchJSON<GetServicePubkeyResponse>('/service-pubkey');
}

export function useServicePubkey() {
  return useQuery({
    queryKey: ['service-pubkey'],
    queryFn: fetchServicePubkey,
    staleTime: 5 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
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

export async function fetchListing(listingId: ListingId): Promise<ListingPublic> {
  return fetchJSON<ListingPublic>(`/listing/${listingId}`);
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

// ─── Attestation bundle ───────────────────────────────────────────────────────

export async function fetchAttestationBundle(dealId: DealId): Promise<NearAiAttestationBundle> {
  return fetchJSON<NearAiAttestationBundle>(`/attestation/${dealId}`);
}

export function useAttestationBundle(dealId: DealId | null) {
  return useQuery({
    queryKey: ['attestation-bundle', dealId],
    queryFn: () => fetchAttestationBundle(dealId!),
    enabled: dealId !== null,
    staleTime: Number.POSITIVE_INFINITY, // attestation bundle never changes once settled
  });
}
