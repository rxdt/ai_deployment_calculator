// Validates repository JSON data files against the JSON Schemas in schemas/.
// Each entry maps a data file (relative to the frontend root) to its schema.
// Run via `npm run json:schema`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import addKeywords from "ajv-keywords";
import secureJsonParse from "secure-json-parse";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// data file -> schema file (both relative to the frontend root)
const TARGETS = {
  "package.json": "schemas/package.schema.json",
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
addKeywords(ajv);

const readJson = (relPath) =>
  secureJsonParse.parse(readFileSync(resolve(root, relPath), "utf8"));

let failures = 0;
for (const [dataPath, schemaPath] of Object.entries(TARGETS)) {
  const validate = ajv.compile(readJson(schemaPath));
  if (validate(readJson(dataPath))) {
    console.log(`ok: ${dataPath} matches ${schemaPath}`);
    continue;
  }
  failures += 1;
  console.error(`invalid: ${dataPath} (${schemaPath})`);
  for (const err of validate.errors ?? []) {
    console.error(`  ${err.instancePath || "/"} ${err.message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} JSON file(s) failed schema validation.`);
  process.exit(1);
}
