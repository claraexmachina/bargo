// NEAR AI Cloud — OpenAI-compatible client for condition parsing.
// baseURL: https://cloud-api.near.ai/v1
// Auth: Bearer ${NEAR_AI_API_KEY}
// Model: qwen3-30b (configurable via NEAR_AI_MODEL env)

import OpenAI from 'openai';
import type { ConditionStruct } from '@bargo/shared';

// --- Custom error ---

export class LLMTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMTimeoutError';
  }
}

// --- JSON schema for NEAR AI response_format (ConditionPair) ---
// Must match ConditionStruct from packages/shared/src/types.ts

const conditionSchema = {
  type: 'object',
  properties: {
    location: {
      type: 'array',
      items: { type: 'string' },
      description: 'Normalized location slugs: gangnam, songpa, hongdae, etc.',
    },
    timeWindow: {
      type: 'object',
      properties: {
        days: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          },
        },
        startHour: { type: 'integer', minimum: 0, maximum: 23 },
        endHour: { type: 'integer', minimum: 0, maximum: 23 },
      },
      required: ['days', 'startHour', 'endHour'],
      additionalProperties: false,
    },
    payment: {
      type: 'array',
      items: { type: 'string', enum: ['cash', 'card', 'transfer', 'crypto'] },
    },
    extras: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['location', 'timeWindow', 'payment', 'extras'],
  additionalProperties: false,
} as const;

export const conditionPairJsonSchema = {
  name: 'ConditionPair',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      seller: conditionSchema,
      buyer: conditionSchema,
    },
    required: ['seller', 'buyer'],
    additionalProperties: false,
    $defs: {},
  },
} as const;

// --- System prompt ---

const SYSTEM_PROMPT = `You parse Korean/English free-text trade conditions into structured JSON. Return ONLY the JSON, no commentary.

Normalize Korean districts: 강남→gangnam, 송파→songpa, 홍대→hongdae.
Days: 평일→[mon,tue,wed,thu,fri], 주말→[sat,sun].
Hours in 24h KST (e.g. 오후 2시→14).
Empty string or "상관없음" or "any" → empty array (no preference).
timeWindow startHour and endHour: if unspecified use 9 and 21 as defaults.`;

// --- Client ---

let _client: OpenAI | null = null;

function getClient(apiKey: string, baseURL: string): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey, baseURL });
  }
  return _client;
}

export interface ParseConditionsPairOpts {
  listingTitle: string;
  sellerText: string;
  buyerText: string;
  apiKey: string;
  baseURL: string;
  model: string;
  timeoutMs: number;
}

export interface ParseConditionsResult {
  seller: ConditionStruct;
  buyer: ConditionStruct;
  completionId: string;
}

export async function parseConditionsPair(
  opts: ParseConditionsPairOpts,
): Promise<ParseConditionsResult> {
  const client = getClient(opts.apiKey, opts.baseURL);

  const userContent = `Listing: "${opts.listingTitle}"

Seller conditions:
${opts.sellerText}

Buyer conditions:
${opts.buyerText}`;

  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs);

  let completion: OpenAI.Chat.ChatCompletion;
  try {
    completion = await client.chat.completions.create(
      {
        model: opts.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: conditionPairJsonSchema as unknown as OpenAI.ResponseFormatJSONSchema['json_schema'],
        },
      },
      { signal: timeoutSignal },
    );
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new LLMTimeoutError(`NEAR AI completion timed out after ${opts.timeoutMs}ms`);
    }
    throw new LLMTimeoutError(
      `NEAR AI completion failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const completionId = completion.id;
  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) {
    throw new LLMTimeoutError('NEAR AI returned empty content');
  }

  let parsed: { seller: ConditionStruct; buyer: ConditionStruct };
  try {
    parsed = JSON.parse(rawContent) as { seller: ConditionStruct; buyer: ConditionStruct };
  } catch {
    throw new LLMTimeoutError(`NEAR AI returned non-JSON content: ${rawContent.slice(0, 100)}`);
  }

  // Basic structural check
  if (!parsed.seller || !parsed.buyer) {
    throw new LLMTimeoutError('NEAR AI response missing seller or buyer fields');
  }

  return { seller: parsed.seller, buyer: parsed.buyer, completionId };
}
