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

| Profile | V1 scope | V1 target status | Authority and placement | Failure and qualification rule |
| --- | --- | --- | --- | --- |
| Local Standalone Desktop | `QUALIFY` | `QUALIFIED` | Standalone Authority; local Orchestrator and AR | No remote fallback; Supervisor, BC stores, and AR reconcile independently |
| Standalone Server | `QUALIFY` | `QUALIFIED` | Standalone Authority with optional external IdP; customer infrastructure | No Platform runtime dependency; operator recovery cannot bypass invariants |
| Managed Shared SaaS | `QUALIFY` | `QUALIFIED` | Platform Authority; shared managed Orchestrator and AR | Durable partial scope admission; no readiness before receipts converge; tenant/Project offboarding, isolation, and anti-resurrection must pass |
| Managed Dedicated | `DESIGN_ONLY` | `DESIGNED` | Platform Authority; dedicated placement binding | No fallback to shared; dedicated isolation, restore, and upgrade evidence required |
| Managed BYOC | `DESIGN_ONLY` | `DESIGNED` | Platform Deployment Management owns signed desired intent; Customer Installation Control Plane owns acceptance, local writer fencing, installation mechanics, and customer-cloud custody | Two-stage plan acceptance, outbound-only steady-state control, no standing Platform cloud admin, explicit degraded/reconciliation states, and no qualification before cloud-specific fencing/restore evidence |
| Hybrid Connected Runtime | `DESIGN_ONLY` | `DESIGNED` | Managed Platform/Orchestrator; customer-hosted AR | Binding generation pinned by Run; no blind retry after disconnect |

Current status is intentionally not copied here. It is read only from the
machine-readable deployment profile manifest. A target never promotes current
status, and this matrix cannot serve as implementation or qualification
evidence.

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

| Status | Surface | Owner and caller | Contract and constraints | Acceptance source and limit |
| --- | --- | --- | --- | --- |
| `PROPOSED` | Platform user administration | Platform; authenticated principal | Platform SDK/API; no internal scope-admission methods | Review proposal; exact Platform API remains open |
| `OPEN` | Standalone scope administration | Standalone Authority; local/server administrator | Orchestrator SDK capability or separate client requires a decision | Orchestrator administration surface has no accepted ADR |
| `PROPOSED` | Internal managed scope admission and binding | Platform process manager and service identity | Privileged Orchestrator operation API, receipts, idempotency, reconciliation | Orchestrator ADR-0080 fixes ownership, not the API or Platform process boundary |
| `PROPOSED` | Break-glass operations | Dedicated operator authority with dual control | Separate audit; cannot bypass aggregates, fences, or use direct SQL as authority | Platform ADR-0004 and ADR-0005 constrain authority but do not accept this surface |
| `CONFIRMED` | Managed BYOC customer installation administration semantics | Customer Installation Control Plane; exact caller kinds remain proposed | Customer-local operations accept signed plans, apply local policy, control writer lease, and never expose product authority | Platform ADR-0005; exact API, caller vocabulary, and implementation remain unqualified |
| `CONFIRMED` | Managed BYOC Platform deployment administration semantics | Platform Deployment Management; exact service/operator callers remain proposed | Platform publishes immutable desired plans and may consume redacted conditions; no customer-cloud credential or secret-decryption surface | Platform ADR-0005; exact read API and caller vocabulary remain unqualified |
| `CONFIRMED` | Customer diagnostics export semantics | Customer Installation Control Plane; explicit customer approval | Redacted preview, bounded scope, and expiry | Platform ADR-0005; exact bundle, caller, audit-receipt, and support protocol remain proposed |

## Design gaps

These design-only questions do not block the three v1 qualification targets.
They must be resolved before the corresponding future profile is implemented.

- `OPEN`: Dedicated data plane versus full-stack Dedicated topology.
- `CONFIRMED`: Platform owns desired installation intent; the customer control
  plane owns local acceptance, writer fencing, installation, upgrade, rollback,
  and uninstall mechanics; AR owns provider toolchains and provider credentials.
  Platform ADR-0005 establishes this ownership split.
- `OPEN`: cloud-specific KMS/HSM, workload identity, external authority anchor,
  HA lease, and infrastructure-fencing products. These are adapter and
  qualification choices constrained by ADR-0005, not domain branching points.
- `OPEN`: whether air-gapped is a separate profile or a Standalone Server
  qualification dimension.
- `CONFIRMED`: `DESIGNED` references reviewed identity, binding, scope-admission,
  security, recovery, and failure artifacts. It does not imply implementation
  readiness. Platform ADR-0001 establishes the profile status semantics.
