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

## Delivery prerequisite: qualified Foundation and managed Docs adoption

This section records the separate consumer prerequisite discovered while
qualifying the correction. It does not execute an upgrade or enlarge this PR's
implementation: the delivered validator delta remains one source line and 33
test lines. Package pins, workflows, source ownership and managed records remain
unchanged. The existing rollout owner retains Central cohort lifecycle and
eligibility; Platform owns its later consumer integration and full checks.

### Actual correction checks and remaining qualification limits

On 2026-11-26, [Architecture run 45857886044, attempt 1](https://github.com/agent-teams-ai/agent-teams-platform/actions/runs/45857886044/attempts/1)
passed on Node 26.11.1 and Node 24.21.0. Jobs 140041088432 and 140041088813
both checked out `dfe12e910366922c8dbc514d0e2cda51d9ea9707`, the synthetic
merge of correction head `beb9cdf0cd1ab2d45351de78ce2eab03b03ee002` into base
`76fc9734f6128b78c7a8b1bc858859fb1cbe835a`. Each full `pnpm check` reported
356 passing tests across its ordinary suites, with zero reported failures,
cancellations, skips or TODOs. The mandatory subset completed its ten identities
under the existing contract with no exceptions; those identities are not ten
additional unique tests. Lint, typed lint, typechecks, clean-checkout executable
specification gates and append-only evidence checks also passed.

The same logs explicitly identify Foundation 1.7.2. They do not negate the
separate local diagnostic that refused TypeScript 5.9.3 initialization through
API Extractor before executing that compiler. Successful ordinary jobs and
qualification against the accepted compiler requirement are distinct facts.

The actual [Documentation Protocol run 45857886539](https://github.com/agent-teams-ai/agent-teams-platform/actions/runs/45857886539)
failed in trusted-authorize job 140040939118 at 16:21:11 UTC, before consumer
installation or semantic checks. Its diagnostic was
`DOCS_GATE_INFRASTRUCTURE_FAILURE`: the Qualified Docs Cohort registry did not
satisfy that installed controller's JSON Schema at `/cohorts/44`. Dependent
consumer checks were skipped or failed their prerequisite. This is a separate
controller compatibility failure; the ADR-0100 correction does not repair it.
No retry or gate bypass is established here. These receipts apply to the exact
correction head above, not to a later documentation or adoption commit.

### Exact target and eligibility boundary

The read-only [Central registry snapshot](https://github.com/agent-teams-ai/.github/blob/b88a08c8131b8c98650318eb374a5fd2840bed46/governance/docs-qualified-cohorts.json)
on 2026-11-26 records `docs-2026-11-26-stable33`, generation 3, as
`QUALIFIED` at event 189. Its immutable record digest is
`sha256:7dc72dd4aa1039d9dcef7f151f8627d1527c7ea71a45932f912461052e1de623`.
The exact target tuple is:

| Package | Version |
| --- | --- |
| `@agent-teams/engineering-foundation` | `4.0.2` |
| `@agent-teams/docs-protocol` | `0.6.9` |
| `@agent-teams/docs-protocol-agent-teams` | `0.7.1` |
| `@agent-teams/document-authoring` | `0.3.9` |
| `@agent-teams/repository-mutation` | `0.5.2` |

The admitted predecessor is Platform's current
`docs-2026-10-03-stable31`. The managed target selects Node 26.11.1,
pnpm 11.20.0 and Linux/x64, with reusable workflow revision
`755c8515a5d106402a7e9e2cff621fb1fdc855cf`.
The immutable canary list contains only Extension Foundation, repository
1333298097. Platform, repository 1319378484, is not eligible while this cohort
is only `QUALIFIED`; its ordinary route requires the rollout owner's legitimate
`RECOMMENDED` transition. Re-read protected authority immediately before any
later preparation and publication. This plan changes neither enrollment nor
eligibility and does not imply that the transition has occurred.

The rollout has a separately observed failure requiring diagnosis. At the
2026-11-26 16:39 UTC observation, [Central PR #434](https://github.com/agent-teams-ai/.github/pull/434)
remained open and Draft at `34e9f442e4ebeef48aac143125abc1d315aa0f69`.
Its [required trusted-admission-evidence job](https://github.com/agent-teams-ai/.github/actions/runs/45844625711/job/139994983431)
in run 45844625711, attempt 1, failed: at 15:01:13 UTC,
`gh api repos/agent-teams-ai/docs-protocol-canary-20260817` returned HTTP 404
and the process exited 1; the check completed with failure at 15:01:16 UTC.
This observation does not distinguish repository deletion from caller access
or another availability cause. Its existing controller/policy owner must
diagnose it. PR #434 scopes EF's desired binding and subsequent EF-only CANARY;
it does not promise Platform eligibility or a `RECOMMENDED` transition. Neither
this terminal failure nor the absent lifecycle transition is resolved by waiting
for an already-running Platform check. This prerequisite does not take over
that owner scope or create another canary route.

### Bounded Platform preparation

Reuse the accepted [Platform adoption policy](engineering-foundation-adoption.md),
the upstream [quality v5 migration](https://github.com/agent-teams-ai/engineering-foundation/blob/da1868240b96113582b508b0c15341c477d6334b/docs/development/quality-v5-migration.md)
and [Stack migration](https://github.com/agent-teams-ai/engineering-foundation/blob/da1868240b96113582b508b0c15341c477d6334b/docs/development/toolchain-adoption.md).
The consumer work is bounded to the following existing authorities and files:

- Use the published retained generation 2-to-3 route to produce the new
  `docs-consumer-integration.json`, `docs-protocol-managed-state.json`, caller
  `.github/workflows/docs-protocol.yml`, qualification evidence and exact
  package/lock/workspace projections. Retain actual preparation, activation and
  restoration receipts. The planner determines which managed assets change.
- Migrate `architecture/foundation/quality-source-coverage.yaml` from 1 to 5;
  add neutral `quality-source-topology.json` beside it and root
  `toolchain.config.json`. Move the existing compiler-project list into the
  latter's `typecheck.projects`; choose `budgetMs` from actual invocation
  measurements. Keep source ownership, suppression rules and lint selections.
- Reuse the public FMS pure topology mapper through a qualified exact package,
  with a small `scripts/architecture/quality-topology.ts` generation/check route,
  adjacent `quality-topology.test.ts` regressions and `derivedFrom` byte bindings. Retain
  the current FMS v1 profile, immutable standard and separate local FMS gate.
  Add only the required tooling package admission to `source-dependencies.yaml`
  and `dependency-declarations.yaml` in `architecture/foundation`.
- Select and qualify the separately published exact Stack installation; change
  the removed Foundation preset references in root `tsconfig.json`,
  `scripts/architecture/tsconfig.json`, `.oxlintrc.json` and
  `.oxlintrc.type-aware.json`. Cover the new TypeScript tooling in the existing
  strict project. Preserve ordinary build/typecheck and both lint scopes;
  adopting repo-wide formatting is outside this prerequisite.
- Keep all new or substantially rewritten topology and qualification code and
  tests in ordinary `.ts` files, explicitly covered by
  `scripts/architecture/tsconfig.json`. Record their exact mandatory test
  entrypoint, ancestry and kind in
  `architecture/foundation/required-node-tests.json` and the selected execution
  command. Existing `.mjs` fixtures receive only bounded maintenance; the
  estimated new regression work is not authorization for a large legacy-JavaScript
  expansion. Preserve all previous required identities and strict coverage.
- Update `scripts/architecture/foundation-upgrade.test.mjs`,
  `foundation-integration.test.mjs`, the full-scan paths in
  `architecture/foundation/repository-agent-workflow.yaml`, and
  `scripts/docs/docs-protocol-adoption.test.mjs`. Preserve every existing
  mandatory test identity and semantic rejection. Add real missing/mismatched
  Stack, weakened-rule, stale-topology and corrected-source controls.
- Update `architecture/runtime/node-compatibility.json`,
  `scripts/compatibility/validate-node-compatibility.mjs` and its existing policy
  tests for exact installed identities, SRIs, manager and source-digest inputs.
  Record the actual resulting adoption in `engineering-foundation-adoption.md`.

`package.json`, `pnpm-workspace.yaml` and `pnpm-lock.yaml` must move coherently
with these changes. Lock generation uses the selected manager normally and is
followed by fresh frozen installs. The five-package managed cohort alone does
not qualify a separately selected Stack or FMS installation.
Exact published Stack/FMS versions, registry SRIs and compatible public exports
remain explicit pending inputs to consumer qualification. Source manifest
versions or the managed cohort's five package coordinates cannot substitute
for those selected installed artifacts.
Source Dependencies is already schema 3 and portable Docs/document-authoring
are already schema 3; a new adoption of those contracts is not needed here.
New product capabilities, package materialization and IAM changes are excluded.

### Host runtime and historical evidence probes

The [accepted retained-upgrade contract](https://github.com/agent-teams-ai/engineering-foundation/blob/da1868240b96113582b508b0c15341c477d6334b/docs/decisions/0070-bounded-managed-generation3-execution.md)
and its [preserved-source amendment](https://github.com/agent-teams-ai/engineering-foundation/blob/da1868240b96113582b508b0c15341c477d6334b/docs/decisions/0075-retained-upgrade-preserving-source-node26-pin.md)
own source observation, exact runtimes, CAS and recovery. Do not initialize the
old compiler to establish source readiness. Published-controller qualification
and an eligible cohort are prerequisites to actual Platform migration.

The generation transition projects root `packageManager` to `pnpm@11.20.0`
and `engines.node` to the cohort's `>=26.0.0 <27`. Platform currently owns a
Node 24/26 engine union and a required Node 24 strict-install/full-check lane.
The hypothesis to qualify is an ordinary Host integration preserving that union
after the managed transition: the profile 4 reader checks exact actual Node 26,
pnpm and `.node-version`, while the manifest planner owns cohort pins/scripts.
This source inspection is not proof that an integrated consumer passes.

Prove real profile 4 after-check on Node 26.11.1/pnpm 11.20.0, Node 24 strict
frozen installation and full compatibility checks, and restoration of the
complete prior tuple. Committed rollback must first reverse overlapping Host
fields through their owner on the unmerged rollback branch, then use the
retained controller's fresh current-target selection. Do not remove the Node 24
lane, weaken engine checks or patch managed receipts to obtain success.

Run `platform-domain-scaffold-evidence.mjs` through its existing required route
against the new Foundation. Reproduce the existing Plan's semantic projection
and validate its Receipt without rewriting historical Plan, Receipt or ADR
bytes. Qualify missing inputs and actual source defects separately from tool or
controller failures. Complete ordinary PR gates, independent final review,
protected merge and checks of the actual merged main remain required.

### Estimated scope and readiness

The read-only estimate is approximately 20–28 affected files, including managed
outputs. The additional handwritten scope is:

| Category | Estimated lines |
| --- | --- |
| Product/domain production code | 0 |
| Tooling/integration TypeScript | 80–180 |
| Regression and qualification tests | 180–400 |
| Configuration and technical data | 120–250 |
| Remaining adoption documentation | 80–160 |

Generated managed records, lockfile churn, upstream implementation and historical
receipts are excluded from those line ranges. Existing Foundation upgrade,
integration, Source Dependencies v3, Docs adoption and Node compatibility tests
provide 1,050 physical lines for reuse; they are not counted as new tests.
Expected effort after eligibility and artifact availability is 2–4 engineering
days. Complexity is 5/10, expected reliability within this scope 8/10, and
estimate confidence 6/10. These are engineering judgments, not measurements.

Uncertainty remains in installed-package compatibility, Host union admission,
semantic scaffold reproduction and actual rollback. No new architectural
decision is currently identified for the one-pattern correction or read-only
preparation. The existing rollout owner must diagnose the observed admission
failure; whether and when the cohort becomes `RECOMMENDED` remains a separate
lifecycle outcome. This record neither assumes that permission changes are
needed nor requests a new canary enrollment. An unexpected contract conflict
must return to its existing owner before implementation expands. This section
establishes a reviewable prerequisite and handoff, not executed adoption,
successful controller repair, merge or final E2E completion.

Prerequisite review round 1 examined candidate blob
`4d722988a8a317e9e170315588b4403d9f937c17` and required explicit strict
TypeScript/test inventories, the actual upstream admission failure and pending
Stack/FMS artifact identities. Round 2 approved revised candidate
`33ea91602b978cdcebc220dce02f79d0afb3eb6b`, with the documentation estimate
clarified to count remaining adoption work rather than this existing handoff.
Independent technical review also approved the bounded source correction at
`beb9cdf0cd1ab2d45351de78ce2eab03b03ee002`. These approvals do not establish
successful CI for a later documentation commit or remove either qualification
limit recorded above.
