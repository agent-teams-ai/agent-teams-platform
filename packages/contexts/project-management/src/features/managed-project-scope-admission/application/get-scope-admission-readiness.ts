import { scopeAdmissionReadiness } from "../domain/scope-admission-readiness.js";
import type {
  GetScopeAdmissionReadinessQuery,
  ProjectManagementDependencies,
} from "./contracts.js";
import { evaluatePreparationAuthority } from "./evaluate-preparation-authority.js";

export function getScopeAdmissionReadinessUseCase(
  dependencies: ProjectManagementDependencies,
) {
  return async (query: GetScopeAdmissionReadinessQuery) => {
    const snapshot = await dependencies.store.loadByOperation(query.operationRef);
    if (snapshot === null || snapshot.project.tenantRef !== query.tenantRef) {
      return { kind: "not-found" } as const;
    }
    const authority = await evaluatePreparationAuthority({
      port: dependencies.authorities.preparationControl,
      query: {
        action: "read-readiness",
        operationRef: query.operationRef,
        projectId: snapshot.project.id,
        requesterRef: query.requesterRef,
        tenantRef: query.tenantRef,
      },
      now: () => dependencies.clock.now(),
    });
    if (authority.kind !== "allowed") {
      return authority;
    }
    return {
      kind: "found",
      readiness: scopeAdmissionReadiness({
        ...snapshot,
        maxPreparationGenerations: dependencies.maxPreparationGenerations,
      }),
    } as const;
  };
}
