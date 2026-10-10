import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges class names, resolving conflicting Tailwind utilities (last one
 * wins) — the standard shadcn/ui helper, used everywhere a component
 * accepts a `className` override. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
