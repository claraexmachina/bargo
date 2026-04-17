'use client';

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import * as React from 'react';

const MAX_BYTES = 2048;

// Warn when user pastes obviously sensitive data
const SENSITIVE_PATTERNS = [
  /[^\s@]+@[^\s@]+\.[^\s@]{2,}/, // email (handles Korean chars before @)
  /01[016789]-?\d{3,4}-?\d{4}/, // Korean mobile
  /\d{6}-\d{7}/, // Korean ID number pattern
];

/** Exported for unit testing */
export function containsSensitiveData(text: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(text));
}

interface ConditionInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ConditionInput({
  id,
  value,
  onChange,
  placeholder = 'e.g. Gangnam/Songpa in-person only, weekday evenings, no box',
  className,
  disabled,
}: ConditionInputProps) {
  const [sensitiveWarning, setSensitiveWarning] = React.useState(false);
  const byteLength = new TextEncoder().encode(value).length;
  const remaining = MAX_BYTES - byteLength;
  const isNearLimit = remaining < 200;
  const isOverLimit = remaining < 0;

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    // Trim to MAX_BYTES on the byte level
    const encoded = new TextEncoder().encode(next);
    if (encoded.length > MAX_BYTES) {
      const trimmed = new TextDecoder().decode(encoded.slice(0, MAX_BYTES));
      onChange(trimmed);
    } else {
      onChange(next);
    }
    setSensitiveWarning(false);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData('text');
    const hasSensitive = SENSITIVE_PATTERNS.some((re) => re.test(pasted));
    if (hasSensitive) {
      setSensitiveWarning(true);
    }
  }

  return (
    <div className="space-y-1">
      <Textarea
        id={id}
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        placeholder={placeholder}
        disabled={disabled}
        rows={4}
        className={cn(
          isOverLimit && 'border-destructive focus-visible:ring-destructive',
          className,
        )}
        aria-describedby={id ? `${id}-hint` : undefined}
      />
      <div className="flex items-start justify-between gap-2">
        <div id={id ? `${id}-hint` : undefined} className="space-y-0.5">
          <p className="text-xs text-muted-foreground">
            Processed inside <strong>NEAR AI TEE</strong>. Auto-purged after agreement. Counterparty
            never sees it.
          </p>
          {sensitiveWarning && (
            <p className="text-xs text-destructive" role="alert">
              Personal information detected (email or phone number). Do not include personal details
              in condition text.
            </p>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 text-xs tabular-nums',
            isNearLimit ? 'text-amber-600' : 'text-muted-foreground',
            isOverLimit && 'text-destructive',
          )}
          aria-live="polite"
        >
          {remaining}B
        </span>
      </div>
    </div>
  );
}
