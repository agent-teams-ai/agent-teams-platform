# Platform Documentation Authoring

Protocol: `agent-teams.docs-protocol/v1`

Use this Skill for every new governed Platform document.

1. Run `pnpm docs:info` before choosing a type, owner, path, or metadata.
2. Find existing authority with `pnpm docs:find -- --text '<topic>'`.
3. Narrow the search by ID, type, status, owner, relation, or blocker.
4. Treat zero matches as a valid result, not as a command failure.
5. Create only a type listed as authoring-enabled by `docs:info`.
6. Build a non-mutating preview with `pnpm docs:new -- ... --dry-run`.
7. Review the exact destination, metadata, heading, and index instruction.
8. Resolve duplicate IDs, missing references, owners, and stale code anchors.
9. Apply the reviewed plan explicitly with `pnpm docs:new -- ... --apply`.
10. Add the manual reported index link to the exact reported index path.
11. Run `pnpm docs:check`; it combines protocol and declared semantic gates.
12. If a transaction is pending, run `pnpm docs:doctor` before any new write.
13. Use `pnpm docs:recover` only for the exact installed Foundation build.

Never hand-edit recovery state, bypass explicit reachability, or infer a policy
that is absent from `docs:info`. Platform architecture and domain validators
remain authoritative for document meaning.
