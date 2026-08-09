import {
  type AggregateRevision,
  type ProductProjectId,
  type ProductProjectIncarnation,
  type TenantRef,
  projectDisplayName,
} from "./value-objects.js";

export type ProductProject = Readonly<{
  id: ProductProjectId;
  tenantRef: TenantRef;
  incarnation: ProductProjectIncarnation;
  displayName: string;
  lifecycle: "open" | "retired";
  revision: AggregateRevision;
  retirementEpoch: number;
}>;

export function createProductProject(input: {
  id: ProductProjectId;
  tenantRef: TenantRef;
  displayName: string;
}): ProductProject {
  return Object.freeze({
    id: input.id,
    tenantRef: input.tenantRef,
    incarnation: 1,
    displayName: projectDisplayName(input.displayName),
    lifecycle: "open",
    revision: 1,
    retirementEpoch: 0,
  });
}
