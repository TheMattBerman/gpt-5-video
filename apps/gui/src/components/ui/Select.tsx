import { SelectHTMLAttributes, forwardRef } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  helperText?: string;
  errorText?: string;
}

const base =
  "w-full rounded-sm border bg-white px-2 py-1 text-sm transition-colors duration-200 ease-standard focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 hover:border-gray-300";

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", id, helperText, errorText, children, ...props }, ref) => {
    const describedBy = [
      helperText ? `${id || "select"}-help` : null,
      errorText ? `${id || "select"}-err` : null,
    ]
      .filter(Boolean)
      .join(" ");
    const errorClasses = errorText
      ? "border-red-300 focus-visible:ring-red-600"
      : "";
    return (
      <div className="space-y-1">
        <select
          ref={ref}
          id={id}
          aria-invalid={!!errorText}
          aria-describedby={describedBy || undefined}
          className={`${base} ${errorClasses} ${className}`}
          {...props}
        >
          {children}
        </select>
        {helperText && (
          <div id={`${id || "select"}-help`} className="text-xs text-gray-600">
            {helperText}
          </div>
        )}
        {errorText && (
          <div id={`${id || "select"}-err`} className="text-xs text-red-700">
            {errorText}
          </div>
        )}
      </div>
    );
  },
);
Select.displayName = "Select";

export default Select;
