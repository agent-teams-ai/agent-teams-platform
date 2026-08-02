---
id: architecture.platform-orchestrator-review.deployment-administration
type: architecture
status: proposed
owner: architecture/deployment
summary: Proposed ownership, capabilities, failure rules, and administration surfaces for deployment profiles.
related:
  - ADR-0001
  - ADR-0004
  - ADR-0005
---

# Deployment and Administration Capability Matrix

| Profile | Status target | Authority and placement | Failure and qualification rule |
| --- | --- | --- | --- |
| Local Standalone Desktop | V1 qualification | Standalone Authority; local Orchestrator and AR | No remote fallback; Supervisor, BC stores, and AR reconcile independently |
| Standalone Server | V1 qualification | Standalone Authority with optional external IdP; customer infrastructure | No Platform runtime dependency; operator recovery cannot bypass invariants |
| Managed Shared SaaS | V1 qualification | Platform Authority; shared managed Orchestrator and AR | Durable partial provisioning; no readiness before receipts converge; tenant/Project offboarding, isolation, and anti-resurrection must pass |
| Managed Dedicated | Design only | Platform Authority; dedicated placement binding | No fallback to shared; dedicated isolation, restore, and upgrade evidence required |
| Managed BYOC | Design only | Platform Deployment Management owns signed desired intent; Customer Installation Control Plane owns acceptance, local writer fencing, installation mechanics, and customer-cloud custody | Two-stage plan acceptance, outbound-only steady-state control, no standing Platform cloud admin, explicit degraded/reconciliation states, and no qualification before cloud-specific fencing/restore evidence |
| Hybrid Connected Runtime | Design only | Managed Platform/Orchestrator; customer-hosted AR | Binding generation pinned by Run; no blind retry after disconnect |

All profiles use the same business invariants. Placement or Deployment Management
may own domain concepts such as isolation tier and placement intent, but cannot
select infrastructure adapters inside domain/application code.

The `project-lifecycle-and-disposition` qualification gate is mandatory for
every qualified profile. It proves terminal identity, owner-local freezes,
versioned participant handling, receipt recovery, restore fencing, and truthful
retained, unsupported, and unknown outcomes. Managed Shared SaaS additionally
proves that one tenant's offboarding cannot observe, detach, revoke, retain, or
erase another tenant's resources.

## Administration surfaces

| Status | Surface | Owner and caller | Contract and constraints |
| --- | --- | --- | --- |
| `PROPOSED` | Platform user administration | Platform; authenticated principal | Platform SDK/API; no internal provisioning methods |
| `OPEN` | Standalone scope administration | Standalone Authority; local/server administrator | Orchestrator SDK capability or separate client requires a decision |
| `PROPOSED` | Internal managed scope admission and binding | Platform process manager and service identity | Privileged Orchestrator operation API, receipts, idempotency, reconciliation |
| `PROPOSED` | Break-glass operations | Dedicated operator authority with dual control | Separate audit; cannot bypass aggregates, fences, or use direct SQL as authority |
| `CONFIRMED` | Managed BYOC customer installation administration | Customer Installation Control Plane; customer operator or workload identity | Customer-local API and operation receipts; accepts signed plans, applies local policy, controls writer lease, and never exposes product authority |
| `CONFIRMED` | Managed BYOC Platform deployment administration | Platform Deployment Management; Platform service identity and authorized operator | Platform API publishes immutable desired plans and reads redacted conditions; no customer-cloud credential or secret-decryption surface |
| `CONFIRMED` | Customer diagnostics export | Customer Installation Control Plane; explicit customer approval | Redacted preview, scoped bundle, time-bounded support access, immutable audit receipt |

## Design gaps

These design-only questions do not block the three v1 qualification targets.
They must be resolved before the corresponding future profile is implemented.

- `OPEN`: Dedicated data plane versus full-stack Dedicated topology.
- `CONFIRMED`: Platform owns desired installation intent; the customer control
  plane owns local acceptance, writer fencing, installation, upgrade, rollback,
  and uninstall mechanics; AR owns provider toolchains and provider credentials.
- `OPEN`: cloud-specific KMS/HSM, workload identity, external authority anchor,
  HA lease, and infrastructure-fencing products. These are adapter and
  qualification choices constrained by ADR-0005, not domain branching points.
- `OPEN`: whether air-gapped is a separate profile or a Standalone Server
  qualification dimension.
- `CONFIRMED`: `DESIGNED` references reviewed identity, binding, scope-admission,
  security, recovery, and failure artifacts. It does not imply implementation
  readiness.
