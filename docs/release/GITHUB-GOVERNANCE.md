# GitHub Release Governance

Last updated: 2026-09-23

The repository currently requires an administrator to enable protection for `main`. This repository setting cannot be enforced by files committed to the feature branch.

## Required `main` ruleset

Create an active branch ruleset targeting `main` with:

- require a pull request before merge
- require the branch to be up to date before merge
- block force pushes
- block branch deletion
- restrict direct updates that bypass pull requests
- require successful status checks

Require the release-critical checks displayed on PRs:

- `quality`
- `Dependency audit`
- `Secret scan`
- `CodeQL`
- `Build API image`
- `Build Web image`

Do not add `Report commerce lint debt` as a required release check while it remains explicitly marked `continue-on-error` in the quality workflow.

## Release permissions

- production image publishing must use the repository-scoped GitHub token only through the approved workflow
- production deployment credentials must live in the deployment platform secret store
- no production `.env` file may be committed
- no administrator should deploy from an uncommitted working tree
- production and staging must use images tagged with the exact approved 40-character SHA

## Promotion rule

The promoted SHA must have successful results for:

1. Monorepo quality
2. Security checks
3. Production container build
4. staging acceptance
5. backup/restore verification

After a candidate changes, prior CI/staging acceptance is not transferable to the new SHA.
