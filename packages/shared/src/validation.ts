import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

export const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

function stripMetaSchema<T extends Record<string, unknown>>(schema: T): T {
  const clone = JSON.parse(JSON.stringify(schema));
  if (clone && typeof clone === "object") {
    if ("$schema" in clone) delete (clone as any).$schema;
    // Remove $id to prevent Ajv duplicate schema registration across HMR/StrictMode rerenders
    if ("$id" in clone) delete (clone as any).$id;
  }
  return clone;
}

export function compileSchema<T>(schema: object) {
  const normalized = stripMetaSchema(schema as any);
  return ajv.compile<T>(normalized as any);
}

export function validate<T>(schema: object, data: unknown) {
  const validator = compileSchema<T>(schema);
  const valid = validator(data);
  return { valid, errors: validator.errors } as const;
}
