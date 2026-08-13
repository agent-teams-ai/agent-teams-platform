---
id: architecture.modular-product-composition
type: architecture
status: proposed
owner: architecture/composition
summary: Proposed compile-time module composition for reusable Platform product capabilities without weakening bounded-context ownership.
related:
  - ADR-0007
  - ADR-0008
  - architecture.engineering-foundation-adoption
---

# Modular Product Composition

This document records the recommended direction for reusable SaaS modules. It
does not yet accept a module manifest, runtime loader, package topology, or
public extension API. Those surfaces require joint review with the parallel
module-design track and explicit implementation approval.

## Recommended model

Platform remains a modular monolith whose product assembly is selected at
compile-time composition roots.

```text
Product bundle
  -> explicit capability modules
     -> bounded-context public, composition, and worker surfaces
        -> feature-owned application and domain
           -> narrow outbound ports
```

The terms are deliberately distinct:

- a bounded context owns one Ubiquitous Language, invariants, persistence,
  migrations, receipts, inbox/outbox, and Published Language;
- a feature slice implements one coherent capability inside its owning context;
- a capability module is a composition-level assembly of typed feature surfaces;
- a product bundle selects capability modules for one product distribution;
- a deployment profile selects adapters and operational policy, not domain
  behavior;
- a third-party extension or runtime plugin is a different future contract.

A module is not a new domain owner and does not create a database shared across
contexts. Module activation never proves authorization, entitlement, readiness,
or deployment qualification.

## Composition rules

- Modules are imported explicitly. Filesystem scanning, package-name discovery,
  ambient registration, and a global service locator are forbidden.
- Each bounded context keeps a private composition boundary. Dependencies enter
  through typed factories or a context-private container used only by
  composition code.
- Cross-context interaction uses consumer-owned ports, Published Languages, and
  ACLs. Modules cannot import another context's domain, repositories, migrations,
  or internal feature entrypoints.
- Commercial plans and subscriptions issue capabilities or restrictions; plan
  names never select code paths inside domain or application layers.
- Local, Shared SaaS, Dedicated, BYOC, and Hybrid differences select adapters,
  placement, and operational policy at composition roots. Core code cannot
  branch on those profile names.
- Missing required capability fails composition or handshake explicitly. There
  is no silent fallback to a weaker module or adapter.
- Module configuration is validated at the composition boundary and passed
  inward as typed values. Domain and application code cannot read environment
  variables or module registries.
- A bounded context package is materialized only with an accepted vertical
  slice. Product bundles cannot justify empty packages or speculative layers.

## Foundation boundary

Engineering Foundation owns generic scaffolding, validation, dependency checks,
and conformance mechanisms. It does not own Platform module names, business
capabilities, product bundles, bounded-context relationships, or runtime product
composition. Production code never imports Foundation.

Platform owns the data that declares its modules and bundles. A future generic
module-schema or composition validator may move into Foundation only after at
least two real consumers prove the same semantics without Platform-specific
vocabulary.

## Current Project Management compatibility

The current Project Management package already has separate public,
composition, and worker exports plus an explicit dependency factory. Its domain
and application layers do not know deployment profiles or a global container.
It can therefore participate in a future capability module without a wholesale
rewrite.

Expected future changes are confined to composition and integration:

- wrap the existing typed surfaces in the accepted module declaration;
- provide production persistence and authority adapters;
- map the composite Orchestrator scope capability through the Managed Lifecycle
  ACL after its Published Language is accepted;
- register product-bundle capability and qualification evidence.

The aggregate model and owner-local process do not need to become plugin APIs.

## Open Decisions

- exact module and product-bundle manifest schemas;
- whether a module maps one-to-one to a package or may assemble several packages;
- module initialization, shutdown, health, and migration ordering;
- dependency cardinality, optional capabilities, and cycle detection;
- server, worker, CLI, and future frontend bundle alignment;
- compatibility policy for independently released modules;
- whether third-party modules are supported and, if so, their trust and sandbox
  boundary;
- exact machine checks and conformance fixtures.

Until these questions are reviewed, no runtime module loader, universal module
interface, module database abstraction, or module marketplace is authorized.
