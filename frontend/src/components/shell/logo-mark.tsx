import { cn } from "@/lib/utils";

/**
 * AgentShield logo mark: an original shield outline holding three horizontal bars of decreasing
 * width, a "filter" that stands for the gateway screening each request. Drawn for this project;
 * not derived from any third-party logo. Decorative by default (aria-hidden): the wordmark or an
 * accessible name next to it identifies the product.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const labelled = title !== undefined;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-5", className)}
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      focusable="false"
    >
      {labelled ? <title>{title}</title> : null}
      <path
        d="M12 2.75 4.75 5.6v5.65c0 4.55 3.05 8.5 7.25 9.95 4.2-1.45 7.25-5.4 7.25-9.95V5.6L12 2.75Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8.25 9h7.5M9.5 12.25h5M10.75 15.5h2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Logo mark on its primary-coloured tile, used in the sidebar, mobile menu and unlock card. */
export function LogoTile({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/25",
        size === "lg" ? "size-11" : "size-8",
        className,
      )}
    >
      <LogoMark className={size === "lg" ? "size-6" : "size-[1.15rem]"} />
    </span>
  );
}
