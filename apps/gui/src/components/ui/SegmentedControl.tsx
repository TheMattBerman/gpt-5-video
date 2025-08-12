import { HTMLAttributes } from "react";

export type SegmentedOption = {
  value: string;
  label: string;
};

export default function SegmentedControl({
  options,
  value,
  onChange,
  className = "",
  size = "md",
  ariaLabel,
}: {
  options: SegmentedOption[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
} & HTMLAttributes<HTMLDivElement>) {
  const sizeClasses =
    size === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-1.5";
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-md border bg-white shadow-card ${className}`}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={selected}
            className={`${sizeClasses} ${
              selected
                ? "bg-accent-50 text-gray-900"
                : "text-gray-700 hover:bg-gray-50"
            } ${i > 0 ? "border-l" : ""} outline-none focus-visible:ring-2 focus-visible:ring-accent-600`}
            onClick={() => onChange(opt.value)}
            aria-label={typeof opt.label === "string" ? opt.label : undefined}
            type="button"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
