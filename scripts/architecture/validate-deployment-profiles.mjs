import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

import { validateDesignReferences } from "./deployment-profile-evidence.mjs";
import {
  validateDeploymentProfileSemantics,
  validateQualificationRecordSemantics,
} from "./deployment-profile-policy.mjs";
import {
  buildForbiddenProfileVocabulary,
  validateCoreProfileIndependence,
  validateCoreSource,
  walk,
} from "./deployment-profile-source.mjs";

export {
  buildForbiddenProfileVocabulary,
  validateCoreSource,
  validateDesignReferences,
  validateDeploymentProfileSemantics,
  validateQualificationRecordSemantics,
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "../..");

function parseArguments(argv) {
  const rootIndex = argv.indexOf("--root");
  const asOfIndex = argv.indexOf("--as-of");
  if (rootIndex !== -1 && !argv[rootIndex + 1]) {
    throw new Error("--root requires a path");
  }
  if (asOfIndex !== -1 && !argv[asOfIndex + 1]) {
    throw new Error("--as-of requires an ISO timestamp");
  }
  const asOf = asOfIndex === -1 ? null : new Date(argv[asOfIndex + 1]);
  if (asOf && Number.isNaN(asOf.getTime())) {
    throw new Error("--as-of requires a valid ISO timestamp");
  }
  return {
    asOf,
    referencesOnly: argv.includes("--references-only"),
    root: rootIndex === -1 ? defaultRepositoryRoot : path.resolve(argv[rootIndex + 1]),
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readYaml(filePath) {
  return YAML.parse(await readFile(filePath, "utf8"));
}

function schemaErrors(validate) {
  return (validate.errors ?? []).map(
    (error) => `DEPLOY-SCHEMA-001 ${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  );
}

function qualificationSchemaErrors(filePath, validate) {
  return (validate.errors ?? []).map(
    (error) =>
      `DEPLOY-RECORD-SCHEMA-001 ${filePath}${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  );
}

async function loadQualificationRecords(catalogDirectory, validateRecordSchema, gateCatalog) {
  const recordDirectory = path.join(catalogDirectory, "qualification-records");
  const records = new Map();
  const errors = [];
  const filePaths = (await walk(recordDirectory))
    .filter((filePath) => filePath.endsWith(".yaml"))
    .toSorted();

  for (const filePath of filePaths) {
    const relativePath = path.relative(catalogDirectory, filePath).split(path.sep).join("/");
    const source = await readFile(filePath, "utf8");
    let record;
    try {
      record = YAML.parse(source);
    } catch (error) {
      errors.push(`DEPLOY-RECORD-YAML-001 ${relativePath}: ${error.message}`);
      continue;
    }

    if (!validateRecordSchema(record)) {
      errors.push(...qualificationSchemaErrors(relativePath, validateRecordSchema));
      continue;
    }

    const expectedFileName = `${record.recordId}.yaml`;
    if (path.basename(filePath) !== expectedFileName) {
      errors.push(`DEPLOY-RECORD-ID-001 ${relativePath}: filename must be ${expectedFileName}`);
    }
    if (records.has(record.recordId)) {
      errors.push(`DEPLOY-RECORD-ID-002 ${record.recordId}: duplicate qualification record identity`);
      continue;
    }

    records.set(record.recordId, {
      contentDigest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
      record,
      relativePath,
    });
    errors.push(...validateQualificationRecordSemantics(record, gateCatalog));
  }

  return { errors, records };
}

export async function validateDeploymentProfiles(repositoryRoot, asOf = null) {
  const catalogDirectory = path.join(repositoryRoot, "architecture/deployment-profiles");
  const schema = await readJson(path.join(catalogDirectory, "deployment-profiles.schema.json"));
  const qualificationRecordSchema = await readJson(
    path.join(catalogDirectory, "qualification-record.schema.json"),
  );
  const catalog = await readYaml(path.join(catalogDirectory, "deployment-profiles.yaml"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const validateRecordSchema = ajv.compile(qualificationRecordSchema);
  const schemaValid = validate(catalog);
  const errors = schemaValid ? [] : schemaErrors(validate);
  if (!schemaValid) {
    return {
      catalog,
      errors: errors.toSorted(),
      qualificationRecords: new Map(),
    };
  }
  const qualificationRecords = await loadQualificationRecords(
    catalogDirectory,
    validateRecordSchema,
    catalog.qualificationGateCatalog,
  );
  errors.push(...qualificationRecords.errors);
  errors.push(
    ...validateDeploymentProfileSemantics(catalog, qualificationRecords.records, asOf),
  );
  errors.push(...(await validateDesignReferences(repositoryRoot, catalog)));
  errors.push(...(await validateCoreProfileIndependence(repositoryRoot, catalog)));
  return {
    catalog,
    errors: errors.toSorted(),
    qualificationRecords: qualificationRecords.records,
  };
}

export async function validateDeploymentDesignReferences(repositoryRoot) {
  const catalogDirectory = path.join(repositoryRoot, "architecture/deployment-profiles");
  const schema = await readJson(
    path.join(catalogDirectory, "deployment-profiles.schema.json"),
  );
  const catalog = await readYaml(
    path.join(catalogDirectory, "deployment-profiles.yaml"),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(catalog)) {
    return { catalog, errors: schemaErrors(validate).toSorted() };
  }
  return {
    catalog,
    errors: (await validateDesignReferences(repositoryRoot, catalog)).toSorted(),
  };
}

async function main() {
  const { asOf, referencesOnly, root } = parseArguments(process.argv.slice(2));
  const result = referencesOnly
    ? await validateDeploymentDesignReferences(root)
    : await validateDeploymentProfiles(root, asOf ?? new Date());
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }
  if (referencesOnly) {
    console.log("Deployment design references valid.");
  } else {
    console.log(
      `Deployment profiles valid: ${result.catalog.profiles.length} profiles, ${result.catalog.qualificationGateCatalog.length} qualification gates.`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
