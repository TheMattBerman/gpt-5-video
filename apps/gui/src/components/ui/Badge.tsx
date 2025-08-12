import { HTMLAttributes } from "react";

type BadgeVariant = "default" | "warning" | "info" | "success" | "error";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const base =
  "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium border shadow-sm bg-gradient-to-b";
const styles: Record<BadgeVariant, string> = {
  default: "from-gray-100 to-gray-200 text-gray-800 border-gray-200",
  warning: "from-yellow-50 to-yellow-100 text-yellow-800 border-yellow-200",
  info: "from-blue-50 to-blue-100 text-blue-800 border-blue-200",
  success: "from-green-50 to-green-100 text-green-800 border-green-200",
  error: "from-red-50 to-red-100 text-red-800 border-red-200",
};

export default function Badge({
  className = "",
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`${base} ${styles[variant]} ${className}`}
      role="status"
      {...props}
    />
  );
}
