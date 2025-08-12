import { SelectHTMLAttributes, forwardRef } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

const base =
  "w-full rounded-sm border border-gray-200 bg-white px-2 py-1 text-sm transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 hover:border-gray-300";

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", children, ...props }, ref) => (
    <select ref={ref} className={`${base} ${className}`} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export default Select;
