import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center rounded-sm font-medium transition-colors duration-200 ease-standard focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 shadow-sm hover:shadow-card border-transparent";
const sizes: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1.5",
  md: "text-sm px-3 py-1.5",
};
const variants: Record<Variant, string> = {
  primary:
    "bg-accent-600 bg-gradient-to-b from-accent-600 to-accent-700 text-white hover:from-accent-700 hover:to-accent-800 focus-visible:ring-accent-600",
  // Stronger contrast on white surfaces; visible border and text color
  secondary:
    "border border-gray-400 bg-gray-50 text-gray-900 hover:bg-gray-100 active:bg-gray-200 focus-visible:ring-gray-400",
  // Keep ghost subtle but readable
  ghost: "text-gray-900 hover:bg-gray-100 active:bg-gray-200",
  danger:
    "bg-gradient-to-b from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 focus-visible:ring-red-600",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export default Button;
