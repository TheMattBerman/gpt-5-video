import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center rounded-sm font-medium transition-colors duration-200 ease-standard focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50";
const sizes: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1.5",
  md: "text-sm px-3 py-1.5",
};
const variants: Record<Variant, string> = {
  primary:
    "bg-accent-600 text-white hover:bg-accent-700 focus-visible:ring-accent-600",
  secondary: "border bg-white hover:bg-gray-50 focus-visible:ring-gray-400",
  ghost: "hover:bg-gray-100",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
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
