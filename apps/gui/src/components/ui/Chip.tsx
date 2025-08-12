import { ButtonHTMLAttributes } from "react";

type ChipVariant = "default" | "filter";
type ChipSize = "sm" | "md";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  variant?: ChipVariant;
  size?: ChipSize;
}

export default function Chip({
  className = "",
  selected = false,
  variant = "filter",
  size = "sm",
  ...props
}: ChipProps) {
  const base =
    "inline-flex items-center rounded-full border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors";
  const sizes: Record<ChipSize, string> = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
  };
  const styles = selected
    ? "bg-blue-50 text-blue-800 border-blue-200"
    : "bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200";
  return (
    <button
      className={`${base} ${sizes[size]} ${styles} ${className}`}
      {...props}
    />
  );
}
