import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

export function Table({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return <table className={`min-w-full text-sm ${className}`} {...props} />;
}

export function THead({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`text-left text-gray-600 ${className}`} {...props} />
  );
}

export function TRow({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`${className}`} {...props} />;
}

export function TH({
  className = "",
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={`px-2 py-1 ${className}`} {...props} />;
}

export function TD({
  className = "",
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-2 py-1 ${className}`} {...props} />;
}

export default Table;
