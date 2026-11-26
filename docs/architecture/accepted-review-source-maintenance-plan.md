---
id: architecture.accepted-review-source-maintenance
type: architecture
status: proposed
owner: architecture
summary: Bound the ADR-0100 validator correction and its regression evidence.
---

# Accepted review source maintenance plan

## Context

At Platform `76fc9734f6128b78c7a8b1bc858859fb1cbe835a`, the review validator
omits accepted Orchestrator ADR-0100 from its explicit source patterns.
[ADR-0100](https://github.com/agent-teams-ai/agent-teams-orchestrator/blob/3dccf2c53bf11f3939a19734a58f5e64d96673d0/docs/decisions/0100-persistent-agents-and-exclusive-team-membership.md)
states that AgentProfileId is distinct from a principal, credential, Run
participant and runtime session. The valid linked claim in
[Platform PR #64](https://github.com/agent-teams-ai/agent-teams-platform/pull/64)
at `8c121fdda9593978e0c985ee10042f0ccc5f9a41` therefore produces
`REVIEW-CONFIRMED-003`.

## Ownership and boundaries

The correction belongs to Platform's existing architecture review validator.
Add the exact accepted source to `scripts/architecture/validate-platform-orchestrator-review.mjs`
and extend its existing test file. Preserve source-cell checks, word boundaries,
proposed review status, and rejection of unknown or review-only evidence.
Do not change the accepted ADR, IAM documents, PR #64, dependency pins, workflows
or the separate hosted documentation cohort controller.

Both affected files are existing JavaScript. This localized list correction and
adjacent regression add no responsibility; migrating the complete validator,
tests and compiler coverage would expand this fix. They remain outside strict
TypeScript coverage. No new maintained JavaScript file is planned.

## Model

1. Publish this bounded plan, receive two critique rounds and incorporate
   concrete corrections before implementation.
2. Add a regression using the actual multiline linked ADR-0100 claim and
   observe its failure before changing the validator. Preserve independent
   rejection checks for unknown and review-only sources, the longer
   `Orchestrator ADR-01000` label and the wrong owner `Platform ADR-0100`.
3. Add only the exact ADR-0100 pattern to the existing accepted-source list.
4. In an isolated fixture, load the actual PR #64 review document bytes
   (whole blob `e8d3b4cdd6a0002d2ee6da3588c70e12c2ff42c9`) without editing
   unrelated evidence. Prove the old validator rejects the claim and the
   corrected validator accepts the review. This is scoped validator evidence,
   not a claim that all PR #64 gates pass.
5. Run the focused suite, changed-file and fast gates, then authoritative
   `pnpm check` with frozen dependencies and the accepted Node/pnpm toolchain.
   Publish coherent commits promptly, obtain independent final review, use
   ordinary protected merge and verify actual-main checks.

Estimated handwritten change: one validator line and 20–50 test lines;
documentation and delivery are separate. Confidence 9/10, expected reliability
within this accepted-source boundary 9/10, complexity 1/10. These are estimates,
not measured reliability or qualification of other ADR claims.

## Evidence and open decisions

The source is already accepted; there is no new architectural decision.
Plan publication does not establish executed regression, review, merge or CI
success. Keep the original failing witness and subsequent actual results in the
owning PR. The separate hosted cohort `/cohorts/44` failure reported on PR #64
remains with its controller owner.

The installed Foundation 1.7.2 CLI attempts to initialize TypeScript 5.9.3
through API Extractor 7.58.12 before selecting configured capabilities. A
diagnostic loader refused that module before its execution; this is not a
passing gate. Full validation must use an ordinary owner-supported corrected
route or remain explicitly pending. Do not change pins, suppress that load,
skip the gate or claim the installed dependency is qualified by this fix.

## Review and bounded execution record

- Round 1 reviewed plan commit `33cef920df22b0d97dcc0ab3b9c3fd4f9e8279ba`
  and required explicit longer-ID and wrong-owner rejections, unchanged whole
  PR #64 document bytes and a truthful full-gate limitation.
- Round 2 approved revised plan `a89061a27f13a5e2f6a336d49f1f704b502c3af2`
  before the validator or tests changed. These are two critique rounds of this
  correction plan, not acceptance of new architecture.
- Before the one-pattern correction, the focused suite had 26 passes and one
  failure: the actual linked ADR-0100 claim produced `REVIEW-CONFIRMED-003`.
  Afterward, all 27 tests passed on Node 24.22.3 and Node 26.11.1, with zero
  failures, cancellations, skips or TODOs. Changed-file lint also passed.
- The complete pinned PR #64 document produced exactly one
  `REVIEW-CONFIRMED-003` before the fix and no review-validator errors afterward.
  The same document blob was used both times. Other PR #64 checks and its merge
  are not established by this result.

Independent final diff review, full-gate qualification, ordinary merge and
actual-main results still need their actual delivery receipts in the owning PR.
