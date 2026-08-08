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

| Status | Contract or semantic surface | Semantic and schema owner | Persistence and truth | Failure and conformance owner | Acceptance source and limit |
| --- | --- | --- | --- | --- | --- |
| `PROPOSED` | Platform Authority API | Platform | Platform authority aggregates and consistent revisioned snapshots; audit or evidence ledger only when capability policy requires it | Platform producer suite plus Orchestrator consumer fixtures | Platform authority aggregate and wire model remain unaccepted |
| `PROPOSED` | Orchestrator AuthorityProvider SPI | Orchestrator | No persistence; consumer semantics are authoritative | Orchestrator fake-provider suite; every adapter runs it | Requires an Orchestrator ADR before package reservation or publication |
| `PROPOSED` | Managed scope admission and binding API | Orchestrator | Orchestrator operations and receipts | Same ID and fingerprint replay receipt; Platform reconciles unknown response | Orchestrator ADR-0080 confirms ownership, not service or message schemas |
| `CONFIRMED` | Platform Project lifecycle semantics | Platform | ProductProject epoch, admission revision, retirement operation, and policy/catalog references | Platform semantic fixtures plus future Managed Lifecycle ACL consumer fixtures | Platform ADR-0004; physical private contract remains proposed |
| `PROPOSED` | Private Platform Project lifecycle wire contract | Platform | Future versioned Platform contract artifact | Producer compatibility and Managed Lifecycle ACL consumer suite | Exact transport, schema, package, and compatibility window remain open |
| `CONFIRMED` | AR Published Language ownership | AR | AR runtime state, feeds, and receipts | AR owns semantic conformance; Orchestrator owns consumer-port expectations | AR ADR-0003; ownership is confirmed, physical artifact is not |
| `OPEN` | AR Published Language artifact | AR | Future AR versioned schemas and capability metadata | Future wire, generated-client, version-handshake, compatibility, and negative-variant suites | AR ADR-0003 explicitly requires a follow-up contract decision |
| `CONFIRMED` | AR internal context package identities | AR | Four private AR package boundaries and their owner decision | AR package-catalog and source-boundary checks; no Platform or Orchestrator consumer contract | AR ADR-0005; package identity only, not Published Language or shared domain types |
| `PROPOSED` | Orchestration project disposition API | Orchestrator | OrchestrationProject deletion epoch, participant obligations, and owner-local receipt refs | Orchestrator producer suite plus Platform reconciliation and lost-acknowledgement fixtures | Orchestrator ADR-0080 confirms ownership and semantics, not API schema |
| `CONFIRMED` | AR cutoff, scope-admission, and technical-disposition semantics | AR | AR scope, cutoff, reconciliation, and context-owned disposition receipts | AR semantic suite plus Orchestrator consumer-port suite | AR ADR-0003 and Orchestrator ADR-0079; exact wire and implementation remain open |
| `CONFIRMED` | AR pre-materialization negative operation-intent semantics | AR Agent Execution | Original acceptance, negative guard, and dispatch claim serialize on one scoped intent identity in the same Agent Execution authority store | Prove every concurrent commit order, delayed original command, exact replay, digest conflict, lost receipt, restore, and anti-resurrection | AR ADR-0004; exact command and receipt schemas remain open |
| `OPEN` | AR runtime-scope provisioning and technical dispatch/control authorization API | AR | AR-owned runtime scope and technical authority state | Public identities, handshake, command schemas, grant shape, compatibility policy, generated client, and producer fixtures require a follow-up AR Published Language decision | `TechnicalExecutionGrant` is only a provisional alias |
| `PROPOSED` | Producer qualification attestation | Producing repository or pipeline | Producer append-only evidence | Producer signs and supersedes; consumer verifies digest and scope | Review proposal; qualification artifact contract remains open |
| `PROPOSED` | Composite profile qualification | Qualification pipeline | Exact release-set verdict | Missing, mismatched, or stale producer evidence fails release admission | Platform ADR-0001 fixes evidence semantics, not pipeline implementation |
| `CONFIRMED` | Platform installation desired-state semantics | Platform Deployment Management | PlatformInstallation desired revision and immutable signed DeploymentPlan chain | Platform producer semantics plus future customer-control-plane consumer fixtures | Platform ADR-0005; exact wire schema remains unqualified |
| `CONFIRMED` | Customer installation control semantics | Customer Installation Control Plane | Customer-local acceptance, authority epoch, writer lease, operation journal, and condition projection | Conformance covers replay, stale plan, lease fencing, crash recovery, unknown outcome, rollback, and redacted diagnostics | Platform ADR-0005; exact protocol and implementation remain unqualified |
| `CONFIRMED` | Runtime distribution acceptance semantics | Artifact producer for Orchestrator/AR; acceptance semantics owned by customer control plane | Content-addressed signed artifact metadata and customer-local acceptance receipt | Producer provenance/signature suite plus consumer integrity, compatibility, health, activation, and rollback fixtures | Platform ADR-0005; exact manifest schema and producer packaging remain open |
| `CONFIRMED` | Common routed Operation identity and recovery semantics | Orchestrator | `CanonicalCommandScope + CommandDescriptor + requestId`, canonicalization version, semantic fingerprint, separate server-generated Operation identity, durable receipt lookup, and recovery semantics | Orchestrator semantic suite proves descriptor-scoped replay, digest conflict, lost-ack recovery, and tenant/resource scoping; request ID alone never resolves an outcome | Orchestrator ADR-0071; exact feature-specific operation payloads remain separate |
| `PROPOSED` | Run-specific operation ledger and lifecycle receipts | Orchestrator Run Orchestration | Run-specific fingerprints, attempts, cancellation, relaunch, and recovery state | Orchestrator producer attestation proves UI disconnect survival and distinct Run command semantics | Exact Run aggregate and public operation representation remain open |
| `PROPOSED` | Per-participant readiness contract | Orchestrator Run Orchestration with AR observations | Participant-local readiness truth and opaque AR observation refs | Orchestrator conformance proves partial readiness and that process liveness never implies provider readiness | Exact public readiness schema remains open |
| `PROPOSED` | AR stop, recovery, and diagnostic-correlation contract | AR | AR-owned operation/effect state, containment, recovery, and redacted diagnostic refs | AR producer attestation plus Orchestrator consumer fixtures for ambiguous acceptance and stale execution evidence | AR semantics exist, but exact Published Language remains open |
| `CONFIRMED` | Business-effect to AR external-effect identity semantics | Business intent owner and AR across a versioned boundary | Intent owner persists `BusinessEffectId` and canonical fingerprint; AR persists its technical effect ledger against the opaque caller identity | Both owners prove conflict and no-blind-retry behavior | AR ADR-0003, AR ADR-0004, and Orchestrator ADR-0079; exact wire remains open |
| `CONFIRMED` | Workspace materialization, risk policy, and technical access ownership | Orchestrator Workspace Registry, Orchestrator Policy and Risk, and AR Runtime Security separately | Workspace materialization, product risk/isolation requirements, and AR path/capability enforcement remain independently owned | ACL conformance proves translation without copying any owner model | Orchestrator ADR-0062 and AR ADR-0001/0002; exact mapping remains open |
| `CONFIRMED` | Runtime binding persistence authority | Orchestration Scope for Project-level binding; Run Orchestration for participant-level binding | Each owning Orchestrator context persists its own binding and process state | Orchestrator suite proves generation, replay, and stale-observation behavior | Orchestrator ADR-0079 and ADR-0080; exact aggregate/public shape remains open |
| `OUT_OF_SCOPE` | Team draft publication | Client for local-only draft; Team Topology for collaborative durable draft | Client storage or Team Topology draft plus immutable published `TeamVersion` | Run creation accepts only a published TeamVersion; autosave never becomes a launch command | Owned by the Orchestrator Team Topology design track, not this Platform boundary review |
| `PROPOSED` | Installation disposition and support bundle | Customer Installation Control Plane | Customer-local drain, uninstall, retained-anchor, diagnostic, redaction, approval, and export receipts | Conformance proves uninstall cannot imply Project retirement, AR effect completion, provider deletion, or worktree deletion | Platform ADR-0005 fixes ownership constraints; exact operation and bundle contracts remain open |

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
imports neither the private package nor Platform domain models. AR private
context packages remain internal to AR and cannot become a shortcut around its
future Published Language.

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

## Cross-repository implementation and qualification gates

The following are recorded here so Platform qualification cannot outrun its
producers. They are not accepted Platform domain models:

- Runtime binding ownership is accepted: Project-level `RuntimeScopeBinding`
  belongs to Orchestration Scope, while participant-level
  `ManagedRuntimeBinding` belongs to Run Orchestration. Implementation still
  requires generation, stale-observation, replay, and recovery fixtures.
- The intent owner and AR keep distinct business and technical identities plus
  one immutable fingerprint. Neither side may mint a replacement identity to
  bypass an uncertain effect. Exact AR wire names and cross-repository fixtures
  remain open.
- Orchestrator workspace risk/isolation requirements and AR technical path and
  capability authorization have separate owners. Exact ACL mappings and
  conformance remain open.
- AR must accept and publish runtime-scope activation, technical dispatch/control
  authorization, handshake, compatibility, and generated-client contracts before
  AR scope activation or runtime dispatch can be implementation-qualified.
  ProductProject creation and Orchestration Scope admission may progress behind
  their own proposed boundary without inventing the AR contract.
- Orchestrator installation-authority evidence must stay separate from external
  integration credentials and AR-owned provider credential bindings.
- Orchestrator and AR must own accepted evidence for durable Run operations,
  participant readiness, cancellation/relaunch, containment, recovery, and
  diagnostic correlation before any profile can qualify.
