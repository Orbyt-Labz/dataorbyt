import { cx } from "@/lib/format";

/** Data Orbyt's orbital "d" mark. */
export function LogoMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={cx("size-8", className)} role="img" aria-label="Data Orbyt">
      <g className={animated ? "orbit-anim" : undefined}>
        <path
          d="M18.1 20.1A24 24 0 0 1 50 22.7V7h8v27a26 26 0 0 1-20 25.3v-8.2A18 18 0 0 0 47.4 26a16 16 0 0 0-23.5-.7Z"
          fill="currentColor"
        />
        <path d="M12.7 29.2a24 24 0 0 0 17.8 30.5v-8.3a16 16 0 0 1-10.2-19.6Z" fill="currentColor" />
        <circle cx="17" cy="25" r="6" fill="#1515f5" />
      </g>
      <circle cx="34" cy="36" r="10" fill="currentColor" />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 text-[#101116]">
      <LogoMark />
      {!collapsed && (
        <span className="text-[17px] leading-none tracking-[-0.045em] lowercase">
          <span className="font-normal">data </span>
          <span className="font-bold">orbyt</span>
        </span>
      )}
    </span>
  );
}
