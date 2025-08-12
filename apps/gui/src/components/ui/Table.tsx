import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

export function Table({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return <table className={`table-base ${className}`} {...props} />;
}

export function THead({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`sticky top-0 z-10 bg-white ${className}`} {...props} />
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
  return <th className={`table-head-cell ${className}`} {...props} />;
}

export function TD({
  className = "",
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`table-cell ${className}`} {...props} />;
}

export default Table;
