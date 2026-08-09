import {
  type ProjectManagementDependencies,
  type ProjectManagementModule,
} from "./application/contracts.js";
import { cancelProjectPreparationUseCase } from "./application/cancel-project-preparation.js";
import { createProductProjectUseCase } from "./application/create-product-project.js";
import { dispatchManagedScopeAdmissionUseCase } from "./application/dispatch-scope-admission.js";
import { getScopeAdmissionReadinessUseCase } from "./application/get-scope-admission-readiness.js";
import { reconcileManagedScopeAdmissionUseCase } from "./application/reconcile-scope-admission.js";
import { recheckScopeAdmissionAuthorityUseCase } from "./application/recheck-scope-admission-authority.js";
import { resumeProjectPreparationUseCase } from "./application/resume-project-preparation.js";
import { assertSafeRetryPolicy } from "./application/safe-retry-policy.js";

export function createProjectManagementModule(
  dependencies: ProjectManagementDependencies,
): ProjectManagementModule {
  assertSafeRetryPolicy(dependencies.safeRetryPolicy);
  if (
    !Number.isSafeInteger(dependencies.dispatchLeaseDurationMs) ||
    dependencies.dispatchLeaseDurationMs <= 0
  ) {
    throw new TypeError("Dispatch lease duration must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(dependencies.maxPreparationGenerations) ||
    dependencies.maxPreparationGenerations <= 0
  ) {
    throw new TypeError(
      "Maximum preparation generations must be a positive safe integer.",
    );
  }
  return Object.freeze({
    application: Object.freeze({
      cancelProjectPreparation: cancelProjectPreparationUseCase(dependencies),
      createProductProject: createProductProjectUseCase(dependencies),
      getScopeAdmissionReadiness: getScopeAdmissionReadinessUseCase(dependencies),
      resumeProjectPreparation: resumeProjectPreparationUseCase(dependencies),
    }),
    worker: Object.freeze({
      dispatchManagedScopeAdmission: dispatchManagedScopeAdmissionUseCase(dependencies),
      reconcileManagedScopeAdmission: reconcileManagedScopeAdmissionUseCase(dependencies),
      recheckScopeAdmissionAuthority: recheckScopeAdmissionAuthorityUseCase(dependencies),
    }),
  });
}

export type {
  ProjectManagementClock,
  ProjectManagementDependencies,
  ProjectManagementIdGenerator,
  ProjectManagementModule,
} from "./application/contracts.js";
export type { CanonicalDigestPort } from "./application/canonical-command-digests.js";
export type {
  AuthorityDecision,
  CommercialProjectCreationAuthorityPort,
  CreateProductProjectAuthorityPort,
  CreationAuthorityPorts,
  ProjectCreationAuthorityQuery,
  ProjectPreparationAuthorityPort,
  ProjectPreparationAuthorityQuery,
  TenantProjectAdmissionPort,
} from "./application/ports/creation-authorities.js";
export type {
  OrchestrationScopeAdmissionPort,
  ScopeAdmissionIntent,
  ScopeAdmissionRecovery,
  ScopeAdmissionRecoveryQuery,
  ScopeAdmissionSubmission,
} from "./application/ports/orchestration-scope-admission.js";
export type {
  ProjectCreationUnitOfWork,
  ProjectManagementStore,
  ScopeAdmissionReadStore,
  ScopeAdmissionUnitOfWork,
} from "./application/ports/project-management-store.js";
export { ids } from "./domain/value-objects.js";
