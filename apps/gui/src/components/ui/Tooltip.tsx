import { HTMLAttributes, ReactNode, useEffect, useRef, useState } from "react";

export interface TooltipProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "content"> {
  label: ReactNode;
  children: ReactNode;
}

export default function Tooltip({
  label,
  children,
  className = "",
  ...props
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [delayTimer, setDelayTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => {
    return () => {
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, [delayTimer]);

  return (
    <div
      ref={ref}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => {
        if (delayTimer) clearTimeout(delayTimer);
        setDelayTimer(setTimeout(() => setOpen(true), 200));
      }}
      onMouseLeave={() => {
        if (delayTimer) clearTimeout(delayTimer);
        setDelayTimer(setTimeout(() => setOpen(false), 100));
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      {...props}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          className="absolute z-50 -translate-y-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-[11px] text-white shadow-elevated"
        >
          {label}
        </div>
      )}
    </div>
  );
}
