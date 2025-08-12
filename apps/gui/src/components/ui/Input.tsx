import { InputHTMLAttributes, forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const base =
  "w-full rounded-sm border border-gray-200 bg-white px-2 py-1 text-sm transition-colors duration-200 ease-in-out placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 hover:border-gray-300";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => (
    <input ref={ref} className={`${base} ${className}`} {...props} />
  ),
);
Input.displayName = "Input";

export default Input;
