import { InputHTMLAttributes, forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  helperText?: string;
  errorText?: string;
}

const base =
  "w-full rounded-sm border bg-white px-2 py-1 text-sm transition-colors duration-200 ease-standard placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 hover:border-gray-300";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", id, helperText, errorText, ...props }, ref) => {
    const describedBy = [
      helperText ? `${id || "input"}-help` : null,
      errorText ? `${id || "input"}-err` : null,
    ]
      .filter(Boolean)
      .join(" ");
    const errorClasses = errorText
      ? "border-red-300 focus-visible:ring-red-600"
      : "";
    return (
      <div className="space-y-1">
        <input
          ref={ref}
          id={id}
          aria-invalid={!!errorText}
          aria-describedby={describedBy || undefined}
          className={`${base} ${errorClasses} ${className}`}
          {...props}
        />
        {helperText && (
          <div id={`${id || "input"}-help`} className="text-xs text-gray-600">
            {helperText}
          </div>
        )}
        {errorText && (
          <div id={`${id || "input"}-err`} className="text-xs text-red-700">
            {errorText}
          </div>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export default Input;
