import Ajv2020 from "ajv/dist/2020";
// Ajv 2020 needs the 2020-12 meta schema added explicitly in some runtimes
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import metaSchema2020 from "ajv/dist/refs/json-schema-2020-12.json";
import addFormats from "ajv-formats";

export const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addMetaSchema(metaSchema2020 as any);
addFormats(ajv);

export function validate<T>(schema: object, data: unknown) {
  const validator = ajv.compile<T>(schema as any);
  const valid = validator(data);
  return { valid, errors: validator.errors } as const;
}

