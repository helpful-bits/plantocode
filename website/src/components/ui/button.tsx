'use client';

import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background duration-200 focus:outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-3 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-[oklch(0.48_0.15_195)] hover:bg-[oklch(0.42_0.17_195)] text-white shadow-lg shadow-[oklch(0.48_0.15_195_/_0.25)] hover:shadow-xl hover:shadow-[oklch(0.48_0.15_195_/_0.35)] dark:bg-[oklch(0.58_0.12_195)] dark:hover:bg-[oklch(0.55_0.13_195)] dark:text-white dark:shadow-[oklch(0.58_0.12_195_/_0.3)]',
        destructive:
          'bg-[oklch(0.53_0.24_25)] hover:bg-[oklch(0.48_0.25_25)] text-white shadow-lg shadow-[oklch(0.53_0.24_25_/_0.25)] hover:shadow-xl hover:shadow-[oklch(0.53_0.24_25_/_0.35)] dark:bg-[oklch(0.55_0.22_25)] dark:hover:bg-[oklch(0.52_0.23_25)] dark:text-white',
        outline:
          'border border-[oklch(0.90_0.04_195)] bg-transparent hover:bg-[oklch(0.97_0.025_195)] hover:border-[oklch(0.48_0.15_195)] text-foreground shadow-sm dark:border-[oklch(0.30_0.045_206)] dark:hover:bg-[oklch(0.22_0.035_206)] dark:hover:border-[oklch(0.58_0.12_195)]',
        secondary:
          'bg-[oklch(0.92_0.05_185)] hover:bg-[oklch(0.88_0.06_185)] text-[oklch(0.2_0.08_195)] shadow-sm dark:bg-[oklch(0.26_0.022_206)] dark:hover:bg-[oklch(0.30_0.025_206)] dark:text-[oklch(0.90_0.006_195)]',
        ghost:
          'hover:bg-[oklch(0.96_0.045_195)] text-muted-foreground dark:hover:bg-[oklch(0.28_0.032_195)]',
        link: 'text-[oklch(0.48_0.15_195)] underline-offset-4 hover:underline dark:text-[oklch(0.68_0.085_195)]',
        'gradient-outline':
          'bg-transparent text-[oklch(0.48_0.15_195)] font-semibold border border-[oklch(0.48_0.15_195_/_0.5)] shadow-lg shadow-[oklch(0.48_0.15_195_/_0.1)] hover:bg-[oklch(0.48_0.15_195_/_0.08)] hover:shadow-xl hover:shadow-[oklch(0.48_0.15_195_/_0.2)] hover:border-[oklch(0.48_0.15_195)] dark:text-[oklch(0.75_0.12_195)] dark:border-[oklch(0.75_0.12_195_/_0.7)] dark:hover:bg-[oklch(0.75_0.12_195_/_0.15)] dark:hover:border-[oklch(0.75_0.12_195)]',
        primary:
          'bg-[oklch(0.48_0.15_195)] hover:bg-[oklch(0.42_0.17_195)] text-white shadow-lg shadow-[oklch(0.48_0.15_195_/_0.25)] hover:shadow-xl hover:shadow-[oklch(0.48_0.15_195_/_0.35)] dark:bg-[oklch(0.58_0.12_195)] dark:hover:bg-[oklch(0.55_0.13_195)] dark:text-white dark:shadow-[oklch(0.58_0.12_195_/_0.3)]',
        cta:
          'bg-gradient-to-r from-[oklch(0.48_0.15_195)] via-[oklch(0.50_0.14_190)] to-[oklch(0.52_0.13_185)] hover:from-[oklch(0.42_0.17_195)] hover:via-[oklch(0.44_0.16_190)] hover:to-[oklch(0.46_0.15_185)] text-white font-bold shadow-lg shadow-[oklch(0.48_0.15_195_/_0.3)] hover:shadow-xl hover:shadow-[oklch(0.48_0.15_195_/_0.4)] dark:from-[oklch(0.58_0.12_195)] dark:via-[oklch(0.60_0.11_190)] dark:to-[oklch(0.62_0.10_185)] dark:hover:from-[oklch(0.55_0.13_195)] dark:hover:via-[oklch(0.57_0.12_190)] dark:hover:to-[oklch(0.59_0.11_185)] dark:text-white',
      },
      size: {
        default: 'h-10 px-4 py-2',
        xs: 'h-7 rounded-lg px-2 text-xs',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-12 rounded-xl px-8 py-3 text-base font-bold',
        xl: 'h-14 rounded-xl px-10 py-4 text-lg font-bold',
        icon: 'h-10 w-10',
        'icon-xs': 'h-6 w-6 rounded-lg',
        'icon-sm': 'h-7 w-7 rounded-lg',
        'icon-lg': 'h-11 w-11 rounded-xl',
        compact: 'h-8 px-2 py-1 text-xs rounded-lg',
        'compact-sm': 'h-6 px-1.5 py-0.5 text-xs rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type BaseButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onAnimationStart' | 'onAnimationEnd'>;
type MotionButtonProps = Omit<HTMLMotionProps<'button'>, 'ref'>;

export interface ButtonProps
  extends BaseButtonProps,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  size?: 'default' | 'xs' | 'sm' | 'lg' | 'xl' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg' | 'compact' | 'compact-sm';
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'gradient-outline' | 'primary' | 'cta';
  whileHover?: MotionButtonProps['whileHover'];
  whileTap?: MotionButtonProps['whileTap'];
  style?: MotionButtonProps['style'];
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      children,
      disabled,
      whileHover,
      whileTap,
      style,
      ...props
    },
    ref,
  ) => {
    if (asChild) {
      const { form, formAction, formEncType, formMethod, formNoValidate, formTarget, ...slotProps } = props;
      return (
        <Slot
          ref={ref}
          className={cn(
            buttonVariants({ variant, size, className }),
          )}
          {...slotProps}
        >
          {children}
        </Slot>
      );
    }

    const motionProps: any = {
      ...props,
      whileHover,
      whileTap,
      ...(style && { style }),
    };

    return (
      <motion.button
        ref={ref}
        className={cn(
          buttonVariants({ variant, size, className }),
        )}
        disabled={disabled}
        {...motionProps}
      >
        {children}
      </motion.button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };