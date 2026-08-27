import { clsx } from "clsx";
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "bg-accent text-accent-foreground hover:brightness-95",
  outline: "border border-border bg-transparent text-foreground hover:bg-muted",
  ghost: "bg-transparent text-foreground hover:bg-muted",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-base",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string
) {
  return clsx(base, variants[variant], sizes[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonProps) {
  return (
    <button className={buttonClasses(variant, size, className)} {...props} />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
