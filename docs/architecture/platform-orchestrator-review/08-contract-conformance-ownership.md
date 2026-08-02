---
id: architecture.platform-orchestrator-review.contract-conformance
type: architecture
status: proposed
owner: architecture/integration
summary: Proposed ownership and conformance boundaries for cross-repository APIs, SPIs, and qualification attestations.
related:
  - architecture.platform-orchestrator-boundary
  - ADR-0004
  - ADR-0005
---

# Cross-Repository Contract and Conformance Ownership

| Status | Contract | Semantic and schema owner | Persistence and truth | Failure and conformance owner |
| --- | --- | --- | --- | --- |
| `PROPOSED` | Platform Authority API | Platform | Platform authority aggregates and consistent revisioned snapshots; audit or evidence ledger only when capability policy requires it | Platform producer suite plus Orchestrator consumer fixtures |
| `PROPOSED` | Orchestrator AuthorityProvider SPI | Orchestrator | No persistence; consumer semantics are authoritative | Orchestrator fake-provider suite; every adapter runs it |
| `PROPOSED` | Managed scope admission and binding API | Orchestrator | Orchestrator operations and receipts | Same ID and fingerprint replay receipt; Platform reconciles unknown response |
| `CONFIRMED` | Private Platform Project lifecycle contract | Platform | ProductProject epoch, admission revision, retirement operation, and policy/catalog references | Platform producer suite plus Managed Lifecycle ACL consumer fixtures |
| `CONFIRMED` | AR Published Language | AR | AR runtime state, feeds, and receipts | AR wire suite plus Orchestrator consumer-port suite |
| `PROPOSED` | Orchestration project disposition API | Orchestrator | OrchestrationProject deletion epoch, participant obligations, and owner-local receipt refs | Orchestrator producer suite plus Platform reconciliation and lost-acknowledgement fixtures |
| `PROPOSED` | AR runtime-scope provisioning, control, and disposition API | AR | AR scope, cutoff, reconciliation, and context-owned disposition receipts | Cutoff/disposition semantics are accepted in AR ADR-0003; scope authority, provisioning, and grants remain proposed in AR ADR-0004; exact schemas and producer fixtures remain gates |
| `OPEN` | AR pre-materialization negative operation-intent guard | AR Agent Execution | Guard receipt serialized with operation acceptance and dispatch claim | AR producer fixtures must prove both race orders, delayed original command, exact replay, digest conflict, and restore resurrection before Orchestrator ADR-0079 can be accepted |
| `PROPOSED` | Producer qualification attestation | Producing repository or pipeline | Producer append-only evidence | Producer signs and supersedes; consumer verifies digest and scope |
| `PROPOSED` | Composite profile qualification | Qualification pipeline | Exact release-set verdict | Missing, mismatched, or stale producer evidence fails release admission |
| `CONFIRMED` | Platform installation desired-state contract | Platform Deployment Management | PlatformInstallation desired revision and immutable signed DeploymentPlan chain | Platform producer fixtures; customer control plane verifies signature, digest, predecessor, expiry, capability semantics, and negative cases |
| `CONFIRMED` | Customer installation control protocol | Customer Installation Control Plane | Customer-local acceptance, authority epoch, writer lease, operation journal, and condition projection | Customer control-plane conformance covers replay, stale plan, lease fencing, crash recovery, unknown outcome, rollback, and redacted diagnostics |
| `CONFIRMED` | Runtime distribution manifest | Artifact producer for Orchestrator/AR; acceptance semantics owned by customer control plane | Content-addressed signed artifact metadata and customer-local acceptance receipt | Producer provenance/signature suite plus consumer integrity, compatibility, health, activation, and rollback fixtures |
| `PROPOSED` | Durable Run operation ledger and lifecycle receipts | Orchestrator Run Orchestration | Orchestrator-owned operation identities, fingerprints, attempts, cancellation, relaunch, and recovery state | Orchestrator producer attestation proves UI disconnect survival, exact replay, lost-ack recovery, and distinct command semantics |
| `PROPOSED` | Per-participant readiness contract | Orchestrator Run Orchestration with AR observations | Participant-local readiness truth and opaque AR observation refs | Orchestrator conformance proves partial readiness and that process liveness never implies provider readiness |
| `PROPOSED` | AR stop, recovery, and diagnostic-correlation contract | AR | AR-owned operation/effect state, containment, recovery, and redacted diagnostic refs | AR producer attestation plus Orchestrator consumer fixtures for ambiguous acceptance and stale execution evidence |
| `OPEN` | Business-effect to runtime-effect binding | Business intent owner and AR across a versioned boundary | Owner-local immutable binding between `BusinessEffectId`, opaque `RuntimeEffectId`, and canonical fingerprint | Both suites prove no new business identity bypasses uncertain runtime acceptance and AR never infers business equivalence |
| `OPEN` | Workspace risk and technical access boundary | Orchestrator Policy/Workspace and AR Runtime Security separately | Orchestrator risk/isolation requirement and AR path/capability authorization remain separate | ACL conformance proves translation without importing or copying either aggregate |
| `OPEN` | Runtime binding persistence authority | Orchestration Scope for Project-level binding; Run Orchestration for participant-level binding | Owning Orchestrator stores after its accepted runtime-binding ADR is superseded | Implementation is blocked until one accepted Orchestrator ownership model replaces the conflicting predecessor |
| `PROPOSED` | Team draft publication | Client for local-only draft; Team Topology for collaborative durable draft | Client storage or Team Topology draft plus immutable published `TeamVersion` | Run creation accepts only a published TeamVersion; autosave never becomes a launch command |
| `PROPOSED` | Installation disposition and support bundle | Customer Installation Control Plane | Customer-local drain, uninstall, retained-anchor, diagnostic, redaction, approval, and export receipts | Conformance proves uninstall cannot imply Project retirement, AR effect completion, provider deletion, or worktree deletion |

## Surface separation

```text
Platform Authority network Published Language
  != Orchestrator AuthorityProvider composition SPI
  != Orchestrator feature-owned consumer ports
  != user-facing Platform or Orchestrator SDK
  != Platform installation desired-state contract
  != customer-local installation control protocol
```

Generated DTOs never become domain entities. The private Managed ACL may import
private Platform contracts and the public Orchestrator SPI, but Orchestrator core
imports neither the private package nor Platform domain models.

Disposition uses two explicit anti-corruption layers:

```text
private Platform lifecycle contract
  -> Managed Lifecycle ACL
  -> Orchestrator-owned project-disposition intent
  -> Orchestrator owner-local participants
  -> Orchestration runtime-scope disposition intent
  -> stateless Runtime ACL
  -> AR-owned TechnicalDispositionPlan
```

The Runtime ACL cannot import Platform contracts or legal-policy DTOs. AR
generated protocol types are confined to this ACL; Orchestrator domain and
application code depend only on consumer-owned ports. Canonical schemas, semantic
fixtures, and capability metadata live in AR. Exact package and service names
remain proposed until AR freezes its Published Language.

## Qualification ownership

- Each repository owns its implementation evidence and content-addressed
  producer attestation.
- A qualification pipeline creates the composite immutable record. Platform
  aggregates references and cannot reinterpret another producer's result.
- The active reference binds record identity and content digest.
- Records bind the exact Platform or Standalone Authority artifact, Orchestrator,
  AR, source commits, build artifacts, lock/SBOM digests, provenance, contract
  versions, criteria version, topology policy, OS, architecture, upgrade path,
  recovery scenario, assessment time, and `reassessBy`.
- Historical evidence remains immutable. The repository check evaluates active
  qualification `reassessBy` against its execution time; tests use an explicit
  clock. An expired record cannot leave a profile `QUALIFIED`.
- Public Local and Standalone releases need signed redacted attestations outside
  the private Platform repository.

## Compatibility rules

- Unknown required capability fails before mutation.
- Unknown outcome never becomes success or blind retry.
- A feed update never replaces exact receipt query or replay after a gap or lost
  acknowledgement.
- A new data-owning writer is incompatible until its versioned catalog entry,
  retired-epoch guard, freeze behavior, and disposition or verified-absence
  fixture are accepted.
- Network API, composition SPI, and SDK have independent semantic versioning.
- Producer and consumer fixtures include binary, semantic, negative, replay,
  stale-revision, and unknown-variant cases.
- AuthorityProvider SPI requires its own Orchestrator ADR before package
  reservation or publication.
- Installation plan contracts carry intent, compatibility requirements, digest,
  predecessor, validity, and signature. They never carry customer-cloud
  credentials, raw secrets, product authorization decisions, or an AR execution
  fence.
- The customer control protocol reports typed conditions and opaque receipts.
  It does not expose its private writer token or turn liveness telemetry into
  mutation authority.
- Contract conformance proves that stale plans and leases cannot mutate, a lost
  response is recovered by stable identity, activation is atomic, rollback is
  compatibility-gated, and old backup state cannot regain writer authority.

## Cross-repository acceptance blockers

The following are recorded here so Platform qualification cannot outrun its
producers. They are not accepted Platform domain models:

- Orchestrator must accept one runtime-binding ownership ADR before persistence
  implementation: Project-level `RuntimeScopeBinding` belongs to Orchestration
  Scope; participant-level `ManagedRuntimeBinding` belongs to Run Orchestration.
- The intent owner and AR need distinct `BusinessEffectId` and opaque
  `RuntimeEffectId` identities plus one immutable fingerprinted binding. Neither
  side may mint a replacement identity to bypass an uncertain effect.
- Orchestrator workspace risk/isolation requirements and AR technical path and
  capability authorization need different names, aggregates, and conformance.
- Orchestrator installation-authority evidence must stay separate from external
  integration credentials and AR-owned provider credential bindings.
- Orchestrator and AR must own accepted evidence for durable Run operations,
  participant readiness, cancellation/relaunch, containment, recovery, and
  diagnostic correlation before any profile can qualify.
