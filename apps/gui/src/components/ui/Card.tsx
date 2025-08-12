import { HTMLAttributes } from "react";

type CardVariant = "surface-1" | "surface-2";

const base = "rounded-md border shadow-card bg-white/90 backdrop-blur-sm";

export function Card({
  className = "",
  variant = "surface-1",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  const variantClasses =
    variant === "surface-2" ? "bg-neutral-50/80" : "bg-white/90";
  return (
    <div className={`${base} ${variantClasses} p-4 ${className}`} {...props} />
  );
}

export function CardHeader({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mb-2 flex items-center justify-between ${className}`}
      {...props}
    />
  );
}

export function CardTitle({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`text-sm font-semibold text-gray-900 ${className}`}
      {...props}
    />
  );
}

export function CardContent({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${className}`} {...props} />;
}

export default Card;
