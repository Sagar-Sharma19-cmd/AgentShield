import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and resolves Tailwind conflicts (the later utility wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
