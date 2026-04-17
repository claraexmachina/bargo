'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import * as React from 'react';

interface PriceInputProps {
  id?: string;
  value: string; // raw numeric string (KRW, no commas)
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  masked?: boolean; // hide value after blur (for reservation price)
  label?: string;
}

export function PriceInput({
  id,
  value,
  onChange,
  placeholder = '0',
  className,
  disabled,
  masked = false,
  label,
}: PriceInputProps) {
  const [focused, setFocused] = React.useState(false);

  // Format with commas for display
  function format(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    return Number(digits).toLocaleString('ko-KR');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '');
    onChange(digits);
  }

  const displayValue = masked && !focused ? (value ? '••••••' : '') : format(value);

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn('pr-8', className)}
        aria-label={label}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        원
      </span>
    </div>
  );
}
