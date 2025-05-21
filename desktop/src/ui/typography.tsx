import { cn } from "@/utils/utils";
import { ReactNode, ElementType } from "react";

interface TypographyProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  [key: string]: unknown;
}

export function H1({
  children,
  className,
  as = "h1",
  ...props
}: TypographyProps) {
  const Component = as;
  return (
    <Component
      className={cn(
        "scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function H2({
  children,
  className,
  as = "h2",
  ...props
}: TypographyProps) {
  const Component = as;
  return (
    <Component
      className={cn(
        "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function H3({
  children,
  className,
  as = "h3",
  ...props
}: TypographyProps) {
  const Component = as;
  return (
    <Component
      className={cn(
        "scroll-m-20 text-2xl font-semibold tracking-tight",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function H4({
  children,
  className,
  as = "h4",
  ...props
}: TypographyProps) {
  const Component = as;
  return (
    <Component
      className={cn(
        "scroll-m-20 text-xl font-semibold tracking-tight",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function P({
  children,
  className,
  as = "p",
  ...props
}: TypographyProps) {
  const Component = as;
  return (
    <Component className={cn("leading-7", className)} {...props}>
      {children}
    </Component>
  );
}

export function Small({
  children,
  className,
  as = "small",
  ...props
}: TypographyProps) {
  const Component = as;
  return (
    <Component
      className={cn("text-sm font-medium leading-none", className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export function Subtle({
  children,
  className,
  as = "p",
  ...props
}: TypographyProps) {
  const Component = as;
  return (
    <Component
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export function Lead({
  children,
  className,
  as = "p",
  ...props
}: TypographyProps) {
  const Component = as;
  return (
    <Component
      className={cn("text-xl text-muted-foreground", className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export function Large({
  children,
  className,
  as = "div",
  ...props
}: TypographyProps) {
  const Component = as;
  return (
    <Component className={cn("text-lg font-semibold", className)} {...props}>
      {children}
    </Component>
  );
}

export function BlockQuote({ children, className, ...props }: TypographyProps) {
  return (
    <blockquote
      className={cn("mt-6 border-l-2 pl-6 italic", className)}
      {...props}
    >
      {children}
    </blockquote>
  );
}

export function Code({ children, className, ...props }: TypographyProps) {
  return (
    <code
      className={cn(
        "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm",
        className
      )}
      {...props}
    >
      {children}
    </code>
  );
}