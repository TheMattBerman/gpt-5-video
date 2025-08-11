import { HTMLAttributes } from "react";

const base = "rounded-md border bg-white shadow-card";

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${base} p-4 ${className}`} {...props} />;
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
  return <div className={`text-sm font-medium ${className}`} {...props} />;
}

export function CardContent({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${className}`} {...props} />;
}

export default Card;
