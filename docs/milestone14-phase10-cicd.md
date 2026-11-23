# Phase 10 CI verification

The GitHub Actions workflow uses read-only repository permissions and local MySQL fixtures. Separate jobs cover console build, dependency audits, API build and lint, Flutter, native migration and native runtime regression. The runtime job uses the successful disposable overlay while the canonical job runs the unmodified migration chain and is expected to fail until compatibility is resolved.

API and console artifacts plus Playwright results are collected by CI. No workflow deploys or reads production credentials. Configure protected checks, artifact retention, action pinning policy, approved rollout, and isolated staging outside the source repository. The workflow was authored locally and has no hosted execution evidence.
