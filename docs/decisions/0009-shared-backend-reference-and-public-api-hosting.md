---
id: ADR-0009
type: adr
status: accepted
owner: architecture/deployment
summary: Adopt the shared backend reference for Platform transport and persistence choices without changing product ownership or release qualification.
approved_by: product-owner
accepted_at: 2026-10-22
supersedes: []
superseded_by: []
related:
  - ADR-0001
  - ADR-0007
  - architecture.platform-orchestrator-boundary
---

# ADR-0009: Shared Backend Reference and Public API Hosting

## Context

Platform needs a reusable backend reference without inheriting Orchestrator's
domain model, service-role map or release claims. On 2026-10-22 the product owner
approved recording the agreed backend direction centrally, with product-local
applicability and separate frontend decisions. This ADR records that approval;
it does not change existing accepted decisions or authorize production packages.

The [organization backend reference](https://github.com/agent-teams-ai/.github/blob/4dcf4ffe29279e479e089bc06f745dd1a62f12d1/docs/backend-stack.md)
owns the technology selection catalog at the reviewed central revision. This ADR
owns its Platform applicability. A newer central revision does not silently
change this adoption, accepted contracts, installed versions or qualification.

## Decision

### Public API and private calls

Use Fastify with the official Connect plugin for Platform's public HTTP/RPC
Host. Connect handlers run in the same server and process; ordinary HTTP routes
such as webhooks and health endpoints share that host where appropriate. Public
API contracts use Protobuf and Buf. This selects hosting and contract mechanisms,
not the still-proposed Platform Authority API or Orchestrator wire schemas.

Public input adapters establish trusted user and tenant context and invoke
owned application interfaces. Domain and application code do not import Fastify,
Connect, generated wire types or network clients. GraphQL or another API style
may later be an input adapter to those same commands and queries; it receives
no direct cross-context database access or additional business authority.

Use standard gRPC/Protobuf through Dapr invocation at real private service-process
boundaries. Each destination implements its own server and owned handlers.
In-process calls use typed local ports. Internal callers do not loop through
their own public HTTP API, and private methods are not automatically exposed
publicly. RPC-only services may use a native server adapter; workers do not all
need Fastify or a Dapr sidecar. Dapr is not an alternate owner of application
state, reliable event delivery or workflows in this profile.

### Language, composition and persistence

Node.js and TypeScript are the primary backend runtime. Rust or Go services need
a concrete CPU, memory, system-integration or library advantage, with the same
language-neutral contract and ownership boundary. This does not require a
language rewrite or duplicate implementation of a TypeScript module library.

Get Modular and Feature Module Standard adoption retain their separately owned
profiles and exact pins. This ADR neither upgrades the current FMS v1 adoption
nor certifies production composition, runtime plugin loading or hot replacement.
It creates no new context, feature, adapter or package target.

Select native PostgreSQL for production persistence, with asynchronous
`node-postgres` and Drizzle inside Node persistence adapters. Each context keeps
its tables, migrations and transaction boundary. Transport, database and engine
representations terminate in adapters; contexts do not share repositories,
database transactions or private tables. The existing in-memory conformance
slice remains evidence for its own scope, not production durability.

### Capability-specific infrastructure

The applicable components of the shared catalog are selected with the first
owning Platform capability, rather than installed in every service:

- Durable event delivery uses the official NATS JetStream SDK through an owned
  adapter with durable pull consumers. Inbox/outbox, idempotency, deadlines and
  uncertain outcomes remain explicit product contracts; no Channels layer or
  custom queue implementation is introduced.
- A Platform process that needs a durable workflow engine uses Temporal behind
  its replaceable application port. Contexts retain business-state authority;
  the engine owns workflow progress. This does not transfer orchestration Runs,
  Work or agent execution from Orchestrator and AR into Platform.
- Realtime delivery uses Centrifugo behind the delivery port. The owning
  commands, queries and snapshots remain authoritative.
- Server composition follows the Compose and Kubernetes direction in the
  central reference. Platform owns its actual topology and qualification; the
  reference does not instantiate all components or promote a deployment profile.

### Retained boundaries and unresolved choices

Platform continues to own identity, tenancy, access, commercial authority and
managed installation intent under ADR-0007 and the other accepted decisions.
Orchestrator and AR remain independent semantic owners. Shared technologies do
not accept the proposed cross-system contracts or introduce shared domain models.

Keycloak and OpenFGA remain the provisional IAM direction. Provider selection,
tenant isolation, revocation consistency and production topology still need the
owning IAM decision and evidence. LangGraph remains a candidate, not an adopted
Platform dependency or a second workflow authority. If selected for an agent
execution capability, its checkpoint, execution-identity, retry and cancellation
contract must have an explicit owner outside Platform's product domain.

Frontend, mobile UI and desktop-shell selections are outside this ADR. A client
connected to a hosted target uses the public API, not direct PostgreSQL access.
Native bundled infrastructure and local Supervisor behavior belong to the owning
local backend profile; they are not mandatory Platform infrastructure.

Release scope remains separately owned. Platform ADR-0001 lists Local Standalone
Desktop as a V1 qualification target, while the
[accepted Orchestrator ADR-0087](https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/98f653172215e2a2c73cc484db3fa4fe72ed21ba/docs/decisions/0087-server-first-v1-deployment-scope.md)
defers fully local delivery. That discrepancy is unresolved and requires explicit
cross-product release-scope reconciliation. This ADR changes neither accepted
V1 scope nor the deployment manifest's evidence-backed status.

## Consequences

- Agents find one central technology catalog and one Platform applicability
  decision instead of maintaining competing full stack tables.
- New adapters preserve existing ownership, lifecycle and failure semantics;
  selecting a library is not implementation or operational qualification.
- Existing accepted ADRs, package targets, FMS pins and current dependencies
  remain unchanged. Production adapters and exact release versions are separate
  scoped work with their applicable conformance and operational evidence.

## Rejected alternatives

- Copy the entire Orchestrator deployment into Platform: it would import another
  product's responsibilities and unnecessary runtime dependencies.
- Replace the public API with Dapr invocation endpoints: it would conflate
  user-facing contracts and private service invocation.
- Make every local module a remote service: it would add transport boundaries
  without an owned deployment or isolation need.
