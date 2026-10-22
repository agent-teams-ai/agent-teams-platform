---
id: ADR-0010
type: adr
status: accepted
owner: architecture/deployment
summary: Confirm fully local V1 alongside hosted targets, sharing owned backend implementations while keeping composition and qualification explicit.
approved_by: product-owner
accepted_at: 2026-10-22
supersedes: []
superseded_by: []
related:
  - ADR-0001
  - ADR-0009
  - architecture.deployment-profiles
  - architecture.platform-orchestrator-boundary
---

# ADR-0010: Fully Local V1 and Shared Backend Profiles

## Context

ADR-0001 already includes Local Standalone Desktop in V1. ADR-0009 recorded a
release-scope discrepancy with the then-current Orchestrator server-first
decision. On 2026-10-22 the product owner explicitly required fully local
operation in V1, alongside hosted operation, with shared backend implementations
and clear profile boundaries.

This additive decision resolves that historical open release-scope note in
ADR-0009. It preserves ADR-0001, the other backend choices in ADR-0009, and their
immutable records. Product decisions own release scope; the central backend
reference remains the technology catalog selected by ADR-0009.

## Decision

### V1 scope and target boundary

Fully Local is required in V1 alongside the existing Standalone Server and
Managed Shared SaaS qualification targets. The local profile cannot be silently
deferred beyond V1. Acceptance of that target is not a claim that it is already
implemented or qualified: the existing deployment manifest retains the actual
evidence-backed status.

The profiles have distinct runtime responsibilities:

- A Desktop client connected to a hosted target uses its public API. That
  connection does not start local PostgreSQL, NATS, backend role processes or
  Dapr sidecars, and does not grant the client direct database access.
- Fully Local runs its own backend on the user's device. Baseline orchestration
  requires no Agent Teams cloud account or Platform runtime. Standalone
  Authority supplies the local authority boundary. An external LLM or provider
  may still require its declared network connection or credentials; local
  backend support does not promise offline operation of every provider.

Target selection is explicit. A disconnected hosted target does not silently
become a local target, and unavailable local infrastructure does not silently
send work to a hosted backend. Authority, identity, storage and migration retain
their owning contracts across any explicit target change.

### Shared implementation and separate composition

Within each owning product, local and hosted profiles use the same domain and
application implementations, owned contracts, PostgreSQL persistence semantics
and migrations. Profile selection stays in composition roots and operational
adapters. Core use cases do not branch on Desktop, cloud, provider or deployment
names except the explicitly registered profile-owning contexts already allowed
by the existing [core invariant](../architecture/deployment-profiles.md#core-invariant);
those contexts still cannot select infrastructure adapters.

The runtime role graph retains the same semantic owners and contracts across
profiles. Replica count, capacity budgets, endpoints, startup and recovery
mechanisms may differ through owned composition and policy. A local deployment
does not introduce a parallel domain implementation or automatically collapse
independent role processes into an unqualified compact host.

DRY applies to genuinely shared mechanisms: one owned implementation for each
reused contract, adapter or process-supervision mechanism. Platform, Orchestrator
and AR keep separate domains, transactions and authority; shared deployment
needs do not justify a universal shared domain package or service locator.
Platform does not acquire Team, Run, Work, provider-execution or sandbox ownership.

### Native local infrastructure

The local backend packages native PostgreSQL, `nats-server`, backend role
processes and the required `daprd` sidecars under owned Supervisor component
ports. `embedded-postgres` remains behind the PostgreSQL component adapter.
Docker is not a prerequisite for the local end user. Hosted installations retain
their separately operated database and Compose/Kubernetes deployment mechanisms.

Dapr remains the private invocation adapter for participating service-process
boundaries. Durable delivery uses the official JetStream SDK directly through
its owned adapter. Local function calls remain local; sidecars are not allocated
per agent or per internal module. These placements preserve the backend
responsibilities accepted in ADR-0009 rather than create a second local transport
or workflow authority.

### Qualification and remaining selections

The [deployment profile manifest](../../architecture/deployment-profiles/deployment-profiles.yaml)
owns current status, exact release evidence and the ten required qualification
gates. The [deployment profile architecture](../architecture/deployment-profiles.md)
defines their promotion rules. All ten gates still require `PASS`;
this decision creates no alternate qualification path.

Local release evidence must cover the selected Windows, macOS and Linux build
targets, exact native binaries and dependencies, packaging, installation and
owned process startup/readiness/shutdown. Persistence, crash recovery, backup
and restore, upgrades, identity, isolation, secrets, fencing, bounded offline
behavior and safe workspace disposition are evaluated under those existing
gates. Shared semantic conformance is reused where its inputs are unchanged;
platform-specific lifecycle and recovery claims need evidence for that platform.

Keycloak/OpenFGA adoption, the concrete local authority deployment and the local
durable workflow engine remain owning decisions requiring qualification. Fully
Local V1 does not select another library, impose a local Temporal deployment or
resolve those choices by falling back to cloud infrastructure. They are work
needed to deliver the accepted V1 scope, not reasons to weaken it silently.

No production package, dependency upgrade, runtime implementation, changed
qualification status or frontend/mobile/desktop-shell selection is introduced
by this documentation decision.

## Consequences

- Local and hosted delivery are both planned against the V1 release scope;
  local lifecycle and recovery qualification cannot be left as post-V1 work.
- The same owner code and contracts are reused while deployment-specific resource
  lifecycle remains explicit and independently verifiable.
- Historical ADR text remains intact. Agents use this decision for the resolved
  local V1 scope and the deployment manifest for actual readiness.

## Rejected alternatives

- Defer fully local support beyond V1: contradicts the owner's explicit scope.
- Fork local and cloud domain implementations: duplicates business rules and
  creates inconsistent ownership and behavior.
- Require an implicit cloud fallback or Platform runtime for local baseline
  orchestration: changes the selected target and authority without consent.
- Treat bundled dependencies or an accepted plan as release qualification:
  neither proves the required lifecycle, security or recovery behavior.
