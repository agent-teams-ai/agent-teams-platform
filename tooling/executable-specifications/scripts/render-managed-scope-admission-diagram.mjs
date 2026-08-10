import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const specificationUrl = new URL(
  "../../../architecture/project-management/managed-scope-admission-process.json",
  import.meta.url,
);
const diagramUrl = new URL(
  "../fixtures/proof-artifacts/managed-scope-admission-model.mmd",
  import.meta.url,
);

export function renderManagedScopeAdmissionDiagram(specification) {
  const lines = ["stateDiagram-v2"];
  const stateIds = new Map(
    specification.axes.lifecycle.states.map((state, index) => [
      state,
      `lifecycle_${index}`,
    ]),
  );
  const stateId = (state) => {
    const identifier = stateIds.get(state);
    if (identifier === undefined) {
      throw new Error(`Diagram references undeclared lifecycle state ${state}.`);
    }
    return identifier;
  };
  for (const state of specification.axes.lifecycle.states) {
    lines.push(`  state "${state}" as ${stateId(state)}`);
  }
  lines.push(`  [*] --> ${stateId(specification.axes.lifecycle.initial)}`);
  for (const event of specification.events) {
    for (const source of event.from) {
      const target = event.to === "$same" ? source : event.to;
      lines.push(
        `  ${stateId(source)} --> ${stateId(target)}: ${event.type}`,
      );
    }
  }
  lines.push(
    "",
    `  note right of ${stateId(specification.axes.lifecycle.initial)}`,
    `    authority: ${specification.axes.authority.states.join(" | ")}`,
    `    reconciliation: ${specification.axes.reconciliation.states.join(" | ")}`,
    `    generation: policy-bound by ${specification.policyBindings.generations}`,
    `    attempts: policy-bound by ${specification.policyBindings.attempts}`,
    "  end note",
    "",
  );
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const specification = JSON.parse(await readFile(specificationUrl, "utf8"));
  await writeFile(diagramUrl, renderManagedScopeAdmissionDiagram(specification));
}
