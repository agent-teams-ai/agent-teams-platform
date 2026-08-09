---
id: domain.contexts.index
type: index
status: accepted
owner: architecture/domain
summary: Index of accepted Platform strategic boundaries and their tactical bounded-context dossiers.
related:
  - ADR-0007
---

# Platform Bounded-Context Dossiers

ADR-0007 accepts the strategic Context Map and the seven boundaries listed here.
That acceptance fixes semantic ownership and cross-context exclusions; it does
not automatically accept each context's tactical aggregate model or authorize an
empty package.

Project Management is the only dossier and package target accepted for
materialization by ADR-0007. The other six dossiers remain `proposed` until an
owning ADR accepts a real first vertical slice and closes the local
materialization gate.

- [Customer Ownership](customer-ownership/README.md)
- [Tenancy](tenancy/README.md)
- [Platform Identity](identity/README.md)
- [Access and Authority](access-authority/README.md)
- [Project Management](project-management/README.md)
- [Commercial Access](commercial-access/README.md)
- [Deployment Management](deployment-management/README.md)

The accepted [strategic context map](../context-map.md) owns relationships and
cross-system exclusions. Each dossier owns only its local language, invariants,
tactical lifecycle candidates, features, and open implementation decisions.
