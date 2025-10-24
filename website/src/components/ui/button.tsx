'use client';

import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl font-medium transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-98',
  {
    variants: {
      variant: {
        default:
          'bg-[oklch(0.48_0.15_195)] hover:bg-[oklch(0.42_0.17_195)] text-white shadow-md hover:shadow-lg shadow-[oklch(0.48_0.15_195_/_0.25)] hover:shadow-[oklch(0.48_0.15_195_/_0.35)] dark:bg-[oklch(0.58_0.12_195)] dark:hover:bg-[oklch(0.55_0.13_195)] dark:text-white dark:shadow-[oklch(0.58_0.12_195_/_0.3)]',
        cta:
          'bg-gradient-to-r from-[oklch(0.48_0.15_195)] via-[oklch(0.50_0.14_190)] to-[oklch(0.52_0.13_185)] hover:from-[oklch(0.42_0.17_195)] hover:via-[oklch(0.44_0.16_190)] hover:to-[oklch(0.46_0.15_185)] text-white font-bold shadow-md hover:shadow-lg shadow-[oklch(0.48_0.15_195_/_0.3)] hover:shadow-[oklch(0.48_0.15_195_/_0.4)] dark:from-[oklch(0.58_0.12_195)] dark:via-[oklch(0.60_0.11_190)] dark:to-[oklch(0.62_0.10_185)] dark:hover:from-[oklch(0.55_0.13_195)] dark:hover:via-[oklch(0.57_0.12_190)] dark:hover:to-[oklch(0.59_0.11_185)] dark:text-white',
        outline:
          'border border-[oklch(0.90_0.04_195)] bg-transparent hover:bg-[oklch(0.92_0.05_195)] hover:border-[oklch(0.48_0.15_195)] text-foreground shadow-sm hover:shadow-md dark:border-[oklch(0.30_0.045_206)] dark:hover:bg-[oklch(0.22_0.035_206)] dark:hover:border-[oklch(0.58_0.12_195)]',
        ghost:
          'hover:bg-[oklch(0.93_0.055_195)] text-muted-foreground hover:text-foreground dark:hover:bg-[oklch(0.28_0.032_195)] dark:hover:text-foreground',
        destructive:
          'bg-[oklch(0.53_0.24_25)] hover:bg-[oklch(0.48_0.25_25)] text-white shadow-md hover:shadow-lg shadow-[oklch(0.53_0.24_25_/_0.25)] hover:shadow-[oklch(0.53_0.24_25_/_0.35)] dark:bg-[oklch(0.55_0.22_25)] dark:hover:bg-[oklch(0.52_0.23_25)] dark:text-white',
        secondary:
          'bg-[oklch(0.92_0.05_185)] hover:bg-[oklch(0.88_0.06_185)] text-[oklch(0.2_0.08_195)] shadow-sm hover:shadow-md dark:bg-[oklch(0.26_0.022_206)] dark:hover:bg-[oklch(0.30_0.025_206)] dark:text-[oklch(0.90_0.006_195)]',
        link: 'text-[oklch(0.48_0.15_195)] underline-offset-4 hover:underline dark:text-[oklch(0.68_0.085_195)]',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        default: 'h-10 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
        xl: 'h-12 px-8 text-base font-semibold',
        icon: 'h-10 w-10',
        'icon-sm': 'h-9 w-9',
        'icon-lg': 'h-11 w-11',
        'icon-xl': 'h-12 w-12',
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
  size?: 'sm' | 'default' | 'lg' | 'xl' | 'icon' | 'icon-sm' | 'icon-lg' | 'icon-xl';
  variant?: 'default' | 'cta' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link';
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