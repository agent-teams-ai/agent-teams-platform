import { readFile } from "node:fs/promises";

import { assign, createActor, createMachine } from "xstate";

export const specification = Object.freeze(
  JSON.parse(
    await readFile(
      new URL(
        "../../../architecture/project-management/managed-scope-admission-process.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);

function predicateAllows(context, predicate, modelSpec) {
  switch (predicate.operator) {
    case "less-than-limit":
      return context[predicate.field] < modelSpec.limits[predicate.limit];
    case "at-least-limit":
      return context[predicate.field] >= modelSpec.limits[predicate.limit];
    case "equals":
      return context[predicate.field] === predicate.value;
    case "not-equals":
      return context[predicate.field] !== predicate.value;
    case "not-in":
      return !predicate.values.includes(context[predicate.field]);
  }
  throw new Error(`Unknown predicate operator ${predicate.operator}.`);
}

function applyTransition(context, transition) {
  const update = { ...transition.effects.set };
  for (const field of transition.effects.increment) {
    update[field] = context[field] + 1;
  }
  return Object.freeze({ ...context, ...update });
}

export function createManagedScopeAdmissionModel(modelSpec = specification) {
  const states = Object.fromEntries(
    modelSpec.axes.lifecycle.states.map((state) => [
      state,
      {
        on: Object.fromEntries(
          modelSpec.events
            .filter((event) => event.from.includes(state))
            .map((event) => [
              event.type,
              {
                target: event.to === "$same" ? state : event.to,
                guard: ({ context }) =>
                  (event.guard?.all ?? []).every((predicate) =>
                    predicateAllows(context, predicate, modelSpec),
                  ),
                actions: assign(({ context }) =>
                  applyTransition(context, event),
                ),
              },
            ]),
        ),
      },
    ]),
  );

  return createMachine({
    id: modelSpec.id,
    context: Object.freeze(structuredClone(modelSpec.initialContext)),
    initial: modelSpec.axes.lifecycle.initial,
    states,
  });
}

export function runTrace(events, modelSpec = specification) {
  const actor = createActor(createManagedScopeAdmissionModel(modelSpec)).start();
  for (const type of events) {
    actor.send({ type });
  }
  const snapshot = actor.getSnapshot();
  actor.stop();
  return snapshot;
}

export function serializeModelState(state) {
  return JSON.stringify({ value: state.value, ...state.context });
}
