import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "../..");
const specificationPath =
  "architecture/project-management/managed-scope-admission-process.json";
const schemaPath =
  "architecture/project-management/managed-scope-admission-process.schema.json";

function formatAjvErrors(errors) {
  return (errors ?? []).map(
    (error) =>
      `SCOPE-SPEC-SCHEMA-001 ${error.instancePath || "/"}: ${error.message}`,
  );
}

export function validateManagedScopeAdmissionDocument(document, schema) {
  const errors = [];
  const validator = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  if (!validator(document)) {
    return formatAjvErrors(validator.errors);
  }

  for (const [axisName, axis] of Object.entries(document.axes)) {
    if (!axis.states.includes(axis.initial)) {
      errors.push(
        `SCOPE-SPEC-AXIS-001 ${axisName} initial state ${axis.initial} is undeclared`,
      );
    }
  }

  const lifecycleStates = new Set(document.axes.lifecycle.states);
  const eventTypes = new Set();
  for (const event of document.events) {
    if (eventTypes.has(event.type)) {
      errors.push(`SCOPE-SPEC-EVENT-001 duplicate event ${event.type}`);
    }
    eventTypes.add(event.type);
    for (const source of event.from) {
      if (!lifecycleStates.has(source)) {
        errors.push(
          `SCOPE-SPEC-EVENT-002 ${event.type} has undeclared source ${source}`,
        );
      }
    }
    if (event.to !== "$same" && !lifecycleStates.has(event.to)) {
      errors.push(
        `SCOPE-SPEC-EVENT-003 ${event.type} has undeclared target ${event.to}`,
      );
    }
  }
  return errors;
}

export async function validateManagedScopeAdmissionSpec(
  repositoryRoot = defaultRepositoryRoot,
) {
  const [document, schema] = await Promise.all(
    [specificationPath, schemaPath].map(async (relativePath) =>
      JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8")),
    ),
  );
  return validateManagedScopeAdmissionDocument(document, schema);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = await validateManagedScopeAdmissionSpec();
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Managed scope-admission executable specification is valid.");
  }
}
