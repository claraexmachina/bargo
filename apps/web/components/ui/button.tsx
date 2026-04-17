import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono font-bold uppercase tracking-wider border-4 border-bargo-ink transition-[transform,box-shadow,filter] duration-75 ease-out active:translate-x-[3px] active:translate-y-[3px] hover:translate-x-[1px] hover:translate-y-[1px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-bargo-accent disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-bargo-accent text-bargo-ink shadow-pixel hover:shadow-pixel-sm active:shadow-[1px_1px_0_#353B51] hover:brightness-110',
        destructive:
          'bg-destructive text-white shadow-pixel hover:shadow-pixel-sm active:shadow-[1px_1px_0_#353B51]',
        outline:
          'bg-bargo-white text-bargo-ink shadow-pixel hover:shadow-pixel-sm active:shadow-[1px_1px_0_#353B51]',
        secondary:
          'bg-bargo-soft text-bargo-ink shadow-pixel hover:shadow-pixel-sm active:shadow-[1px_1px_0_#353B51]',
        ghost:
          'border-transparent bg-transparent shadow-none hover:bg-bargo-white hover:border-bargo-ink hover:shadow-pixel-sm hover:translate-x-0 hover:translate-y-0 active:translate-x-0 active:translate-y-0',
        link: 'border-transparent bg-transparent shadow-none underline-offset-4 hover:underline hover:translate-x-0 hover:translate-y-0 active:translate-x-0 active:translate-y-0 text-bargo-ink normal-case tracking-normal',
      },
      size: {
        default: 'h-11 px-6 text-sm',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-13 px-8 py-3 text-sm',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
