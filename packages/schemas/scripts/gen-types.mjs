import { compileFromFile } from 'json-schema-to-typescript';
import { writeFile, readdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const schemasDir = join(__dirname, '..', 'schemas');
  const outFile = join(__dirname, '..', 'src', 'types.gen.ts');

  const files = (await readdir(schemasDir)).filter((f) => f.endsWith('.schema.json'));
  let out = `// Auto-generated from JSON Schemas. Do not edit.\n`;
  out += `// Run: npm -w packages/schemas run gen:types\n\n`;
  for (const f of files) {
    const schemaPath = join(schemasDir, f);
    const ts = await compileFromFile(schemaPath, {
      bannerComment: '',
      style: {
        singleQuote: true
      }
    });
    const exportName = basename(f, '.schema.json').replace(/[-]([a-z])/g, (_, c) => c.toUpperCase());
    out += `// Schema: ${f}\n`;
    out += ts + '\n';
  }
  await writeFile(outFile, out, 'utf8');
  console.log(`Wrote ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


