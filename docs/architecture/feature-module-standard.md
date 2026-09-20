# Feature module standard adoption

Platform adopts the organization feature module standard v1 for its bounded
project-management context. Production code is owned by the feature layers in
`architecture/foundation/feature-modules.json`; tests remain test-owned.

Run `pnpm architecture:features:check` and `pnpm quality:scope` before review.
