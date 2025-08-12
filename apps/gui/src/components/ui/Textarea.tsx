import { TextareaHTMLAttributes, forwardRef } from "react";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

const base =
  "w-full rounded-sm border bg-white px-2 py-1 text-sm transition-colors duration-200 ease-standard placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 hover:border-gray-300";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", ...props }, ref) => (
    <textarea ref={ref} className={`${base} ${className}`} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export default Textarea;
