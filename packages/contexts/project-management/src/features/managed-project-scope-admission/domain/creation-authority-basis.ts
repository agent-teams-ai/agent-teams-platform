import type {
  Instant,
  OpaqueAuthorityEvidenceRef,
  OpaqueAuthorityRevision,
} from "./value-objects.js";

export type CreationAuthorityEvidence = Readonly<{
  source:
    | "tenant-admission"
    | "project-creation-authority"
    | "commercial-project-creation";
  evidenceRef: OpaqueAuthorityEvidenceRef;
  revision: OpaqueAuthorityRevision;
  validUntil: Instant;
}>;

export type CreationAuthorityBasisSnapshot = Readonly<{
  checkedAt: Instant;
  validUntil: Instant;
  evidence: readonly [
    CreationAuthorityEvidence,
    CreationAuthorityEvidence,
    CreationAuthorityEvidence,
  ];
}>;
