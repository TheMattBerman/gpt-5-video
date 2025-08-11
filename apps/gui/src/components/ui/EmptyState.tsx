import { HTMLAttributes, ReactNode } from "react";

export default function EmptyState({
  title = "Nothing here yet",
  description,
  actions,
  className = "",
  ...props
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-md border bg-white p-6 text-center ${className}`}
      {...props}
    >
      <div className="text-sm font-medium">{title}</div>
      {description && (
        <div className="mt-1 text-sm text-gray-600">{description}</div>
      )}
      {actions && <div className="mt-3 flex justify-center">{actions}</div>}
    </div>
  );
}
