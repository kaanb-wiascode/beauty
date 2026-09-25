# VALOO Release Strategy

## Branch roles

- `main`: production-grade history only. Direct development is not allowed.
- `release/*`: frozen release candidates. Only release-blocker fixes may be committed here.
- `feature/*`: active product development. New features never go directly to `main`.
- `hotfix/*`: urgent production fixes branched from `main`, merged back through a pull request.

## Standard release flow

1. Finish development on the relevant `feature/*` branch.
2. Require green quality and security checks on the feature head.
3. Create a dated/versioned `release/*` branch from the approved feature SHA.
4. Freeze the release branch. Only release blockers may be patched.
5. Open a pull request from `release/*` to `main`.
6. Require the following checks before merge:
   - `quality`
   - `Dependency audit`
   - `Secret scan`
   - `CodeQL`
   - `Build API image`
   - `Build Web image`
7. Deploy the exact release SHA to staging.
8. Complete staging verification and business acceptance.
9. Merge the release pull request to `main`.
10. Deploy the exact approved main SHA to production and create a stable SemVer tag.

## Release freeze rule

After a `release/*` branch is created:

- no feature work,
- no refactors that are unrelated to a release blocker,
- no dependency upgrades unless they resolve a release blocker,
- no force pushes,
- no rewriting release history.

A release blocker fix must be small, reviewable, and pass the full release gate again.

## Main branch rule

`main` is not a development branch. Changes reach `main` only through pull requests.

The repository's main protection workflow is expected to enforce:

- pull-request-only changes,
- required CI/security/container checks,
- up-to-date branch requirement,
- no force pushes,
- no branch deletion,
- resolved review conversations.

## Staging rule

Staging deployments must use a full 40-character SHA that belongs to a `release/*` branch. Do not deploy a moving feature branch name to staging.

## Production rule

Production deployments must use a release SHA that:

- is already an ancestor of `main`,
- passed all required checks,
- passed staging verification,
- has a successful staging release attestation,
- is tagged with a stable SemVer tag such as `v1.0.0`.

## Hotfix flow

1. Create `hotfix/<short-description>` from the current production `main`.
2. Apply the minimum required fix.
3. Run the full quality, security and container gates.
4. Open a pull request to `main`.
5. Deploy to staging if the change affects runtime behavior or data.
6. Merge to `main`, deploy the exact SHA, then create a patch SemVer tag.
7. Reconcile the hotfix back into active feature development so it is not lost.
