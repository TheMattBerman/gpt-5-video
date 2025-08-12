import { HTMLAttributes } from "react";

type BadgeVariant = "default" | "warning" | "info" | "success" | "error";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const base =
  "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium border shadow-sm";
const styles: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-800 border-gray-200",
  warning: "bg-yellow-50 text-yellow-800 border-yellow-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
  success: "bg-green-50 text-green-800 border-green-200",
  error: "bg-red-50 text-red-800 border-red-200",
};

export default function Badge({
  className = "",
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span className={`${base} ${styles[variant]} ${className}`} {...props} />
  );
}
