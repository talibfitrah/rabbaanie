<!-- /autoplan restore point: /home/farouq/.gstack/projects/talibfitrah-rabbaanie/play-store-release-autoplan-restore-20260802-013058.md -->
# Rabbaanie Google Play Review Readiness Plan

## Goal

Prepare a new signed Google Play Android App Bundle and submission packet that eliminate all known technical and policy-driven rejection causes. Google Play review remains discretionary, so the deliverable is the strongest evidence-backed submission possible, not a guarantee of approval.

## Current Status

- The branch is `play-store-release`, level with `origin/main`, with uncommitted Play preparation changes preserved in the worktree.
- The freshly signed candidate is `/home/farouq/Documents/rabbaanie-v1.4.71.aab` with SHA-256 `fffcbd27117c6f6856e19acb5f4a7d0083b742464a58e1ad718a387e58fa174e`.
- A release-mode x86_64 build from the same source was installed on the running Android API 36 emulator and tested from cleared app data.
- Verified completed work includes sign-in-only positioning, removal of sensitive unused permissions and Play monitoring code, Firebase notification-token correction, a neutral adult age gate, notification lifecycle gating, server-verified native OAuth, broad in-app AI response reporting, 30-day account erasure on production, legal-page updates, and the Rabbaanie rebrand cleanup.
- The Play Console account is an organization account. D-U-N-S/account verification state remains an external check.
- The dedicated Play review account successfully signed into the v1.4.71 Play build.
- Remaining release blockers: `google-services.json` is untracked, and Codex/Cubic quota errors prevent the two required clean stage-9 review rounds.

## Completed Implementation

1. Add a neutral age gate that appears before login, Google OAuth, location permission, and other sensitive collection. It must not encourage a particular answer, must persist the decision locally, and must define a safe underage outcome consistent with the declared target audience.
2. Harden `app/oauth/callback.tsx` so deep-link `sessionToken` and `user` parameters never establish local authentication without server validation. Keep the server-issued `code` + `state` exchange path working.
3. Add focused automated tests for age-gate routing/persistence and OAuth callback trust boundaries.
4. Rebuild the release-mode emulator APK, install it, and exercise clean under-age and adult flows, sign-in, and core navigation.
5. Capture four real, Play-compliant 1080 × 1920 RGB phone screenshots from the final source revision. The listing set is dashboard, weekly guidance, Fitrah, and Dhikr in `/home/farouq/Documents/rabbaanie-play-listing-screenshots-v1.4.71/`; the taller images are QA evidence only.

## Play Console and Listing Work

1. Completed: refreshed `/home/farouq/Documents/rabbaanie-play-console-submission.md` with artifact details, organization-account facts, verified reviewer access, Data Safety mapping, adult-only target audience, exact-alarm guidance, AI reporting, and account-deletion behavior.
2. Completed: verified the relevant Google Play policies against primary Google sources. Recheck live Console wording when entering declarations.
3. Record which external Play Console states cannot be verified locally: organization/D-U-N-S verification, developer identity/contact verification, app access credentials accepted by the reviewer, Data Safety form values, target-audience selections, monitoring-app declaration, exact-alarm declaration if prompted, ads/content-rating/news/health/financial declarations, and final screenshot upload.

## Release Verification

1. Completed locally: TypeScript and the 117-case focused release suite pass; full historical-suite limitations are documented rather than hidden.
2. Completed through gstack `/review`; the required external Codex/Cubic clean-cycle gate remains quota-blocked.
3. Completed: built a fresh signed ARM Play AAB from the reviewed working tree.
4. Completed: independently verified package/version, min/target SDK, permissions, monitoring metadata absence, signing certificate, native ABIs, file size, and SHA-256.
5. Completed: refreshed Graphify after code changes (2,873 nodes / 5,664 edges).

## Success Criteria

- No known P0/P1 auth, privacy, deletion, monitoring, permission, or build issue remains.
- A clean fresh-install emulator run reaches the intended review experience without stale branding, dead ends, or unexpected permission collection.
- Screenshots come from the final reviewed source and match the store listing.
- The submission packet contains exact copy and a clear manual checklist for every Play Console-only declaration.
- The final AAB is freshly built, cryptographically identified, and mechanically validated.

## Explicitly Not in Scope

- Uploading or submitting the bundle in Play Console without the user's explicit authorization.
- Claiming guaranteed approval or a zero-percent rejection probability.
- Redesigning unrelated product features or cleaning unrelated untracked/generated files.
