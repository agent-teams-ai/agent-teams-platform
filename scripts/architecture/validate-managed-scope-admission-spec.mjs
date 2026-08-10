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

  validateAxes(document, errors);
  validateInitialContext(document, errors);
  validateEvents(document, errors);
  return errors;
}

function validateAxes(document, errors) {
  for (const axisName of ["lifecycle", "authority", "reconciliation"]) {
    const axis = document.axes[axisName];
    if (!axis.states.includes(axis.initial)) {
      errors.push(
        `SCOPE-SPEC-AXIS-001 ${axisName} initial state ${axis.initial} is undeclared`,
      );
    }
  }
}

function validateInitialContext(document, errors) {
  if (
    document.initialContext.authority !== document.axes.authority.initial ||
    document.initialContext.reconciliation !==
      document.axes.reconciliation.initial ||
    document.initialContext.generation !== document.axes.generation.initial
  ) {
    errors.push("SCOPE-SPEC-CONTEXT-001 initial context disagrees with its axes");
  }
}

function validateEvents(document, errors) {
  const lifecycleStates = new Set(document.axes.lifecycle.states);
  const authorityStates = new Set(document.axes.authority.states);
  const reconciliationStates = new Set(document.axes.reconciliation.states);
  const eventTypes = new Set();
  for (const event of document.events) {
    if (eventTypes.has(event.type)) {
      errors.push(`SCOPE-SPEC-EVENT-001 duplicate event ${event.type}`);
    }
    eventTypes.add(event.type);
    validateLifecycleReferences(event, lifecycleStates, errors);
    validateEffects(event, {
      authorityStates,
      reconciliationStates,
      receiptKinds: new Set(document.vocabulary.receiptKinds),
      blockReasons: new Set(document.vocabulary.blockReasons),
    }, errors);
    validateGuards(event, document.vocabulary, errors);
  }
}

function validateLifecycleReferences(event, lifecycleStates, errors) {
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

function validateEffects(
  event,
  vocabulary,
  errors,
) {
  const authority = event.effects.set.authority;
  const reconciliation = event.effects.set.reconciliation;
  if (authority !== undefined && !vocabulary.authorityStates.has(authority)) {
    errors.push(
      `SCOPE-SPEC-EFFECT-001 ${event.type} sets undeclared authority ${authority}`,
    );
  }
  if (
    reconciliation !== undefined &&
    !vocabulary.reconciliationStates.has(reconciliation)
  ) {
    errors.push(
      `SCOPE-SPEC-EFFECT-002 ${event.type} sets undeclared reconciliation ${reconciliation}`,
    );
  }
  if (
    event.effects.set.receipt !== undefined &&
    event.effects.set.receipt !== null &&
    !vocabulary.receiptKinds.has(event.effects.set.receipt)
  ) {
    errors.push(
      `SCOPE-SPEC-EFFECT-005 ${event.type} sets undeclared receipt ${event.effects.set.receipt}`,
    );
  }
  if (
    event.effects.set.blockReason !== undefined &&
    event.effects.set.blockReason !== null &&
    !vocabulary.blockReasons.has(event.effects.set.blockReason)
  ) {
    errors.push(
      `SCOPE-SPEC-EFFECT-006 ${event.type} sets undeclared block reason ${event.effects.set.blockReason}`,
    );
  }
  if (event.to !== "$same" && !event.effects.increment.includes("revision")) {
    errors.push(
      `SCOPE-SPEC-EFFECT-003 ${event.type} changes lifecycle without revision`,
    );
  }
  for (const field of event.effects.increment) {
    if (event.effects.set[field] !== undefined) {
      errors.push(
        `SCOPE-SPEC-EFFECT-004 ${event.type} both sets and increments ${field}`,
      );
    }
  }
}

function validateGuards(event, vocabulary, errors) {
  for (const predicate of event.guard?.all ?? []) {
    const expectedLimit =
      predicate.field === "attemptCount" ? "attempts" : "generations";
    if (predicate.limit !== undefined && predicate.limit !== expectedLimit) {
      errors.push(
        `SCOPE-SPEC-GUARD-001 ${event.type} compares ${predicate.field} with ${predicate.limit}`,
      );
    }
    if (
      predicate.field === "receipt" &&
      !vocabulary.receiptKinds.includes(predicate.value)
    ) {
      errors.push(
        `SCOPE-SPEC-GUARD-002 ${event.type} references undeclared receipt ${predicate.value}`,
      );
    }
    if (
      predicate.field === "blockReason" &&
      predicate.values.some(
        (value) => !vocabulary.blockReasons.includes(value),
      )
    ) {
      errors.push(
        `SCOPE-SPEC-GUARD-003 ${event.type} references an undeclared block reason`,
      );
    }
  }
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
