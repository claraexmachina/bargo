import { cn } from '@/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';
import type * as React from 'react';

const badgeVariants = cva(
  'inline-flex items-center gap-1 border-2 border-bargo-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider leading-none',
  {
    variants: {
      variant: {
        default: 'bg-bargo-accent text-bargo-ink',
        secondary: 'bg-bargo-soft text-bargo-ink',
        destructive: 'bg-destructive text-white',
        outline: 'bg-transparent text-bargo-ink',
        // Karma tiers — mapped to pixel palette
        newcomer: 'bg-bargo-white text-bargo-ink',
        regular: 'bg-bargo-mint text-bargo-ink',
        trusted: 'bg-bargo-soft text-bargo-ink',
        elite: 'bg-bargo-accent text-bargo-ink',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
