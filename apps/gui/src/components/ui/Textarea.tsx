import { TextareaHTMLAttributes, forwardRef } from "react";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  helperText?: string;
  errorText?: string;
}

const base =
  "w-full rounded-sm border bg-white px-2 py-1 text-sm transition-colors duration-200 ease-standard placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 hover:border-gray-300";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", id, helperText, errorText, ...props }, ref) => {
    const describedBy = [
      helperText ? `${id || "textarea"}-help` : null,
      errorText ? `${id || "textarea"}-err` : null,
    ]
      .filter(Boolean)
      .join(" ");
    const errorClasses = errorText
      ? "border-red-300 focus-visible:ring-red-600"
      : "";
    return (
      <div className="space-y-1">
        <textarea
          ref={ref}
          id={id}
          aria-invalid={!!errorText}
          aria-describedby={describedBy || undefined}
          className={`${base} ${errorClasses} ${className}`}
          {...props}
        />
        {helperText && (
          <div
            id={`${id || "textarea"}-help`}
            className="text-xs text-gray-600"
          >
            {helperText}
          </div>
        )}
        {errorText && (
          <div id={`${id || "textarea"}-err`} className="text-xs text-red-700">
            {errorText}
          </div>
        )}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";

export default Textarea;
