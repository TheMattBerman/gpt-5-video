export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type Result<T> = { ok: true; value: T } | { ok: false; error: Error };

