# Freshness incident recovery

This runbook covers failures from the independent **Check deployment freshness** workflow. The probe requests the deployed `data/latest.json` with a cache-busting query, retries one transient HTTP 5xx response, rejects persistent HTTP/JSON errors, requires a successful warning source, reuses the 22-county warning-schema validator, and fails when `generatedAt` is older than 90 minutes or more than 5 minutes in the future. A failed probe now requests one `pages.yml` recovery run while preserving the failed freshness check as an alert; the recovery still uses the normal validation and last-known-good safeguards.

## 1. Confirm the incident

```bash
gh run list --workflow freshness.yml --limit 5
gh run view <run-id> --log-failed
DEPLOYMENT_URL=https://livejiaquan.github.io/taiwan-weather-risk-dashboard/data/latest.json npm run probe:freshness
```

First confirm whether the failed run's **Request a recovery deployment** step started a new `pages.yml` run, then classify the failure before changing code:

- **HTTP/DNS/Pages error**: inspect the latest Pages deployment.
- **Stale timestamp**: inspect whether scheduled Pages refreshes were delayed or cancelled.
- **Invalid warning schema/source**: treat the deployed artifact as unavailable; do not reinterpret it as “no warning.”
- **Future timestamp**: check runner/upstream clock and payload provenance before accepting the artifact.

## 2. Recover without changing history

First retry the existing build/deploy path. The generator validates the live CWA warning feed and preserves the checked-in last-known-good artifact when refresh fails.

```bash
gh workflow run pages.yml
gh run list --workflow pages.yml --limit 5
gh run watch <run-id> --exit-status
npm run probe:freshness
```

Do not hand-edit timestamps, weaken the 22-county validator, or publish sample/mock data to make the probe green.

If CWA is temporarily unavailable and the deployed cache exceeds 90 minutes, leave the dashboard fail-closed and wait for a validated refresh. A stale cache is context for diagnosis, not current-warning truth.

## 3. Roll back a bad code deployment

Use a normal revert so history and the incident are auditable:

```bash
git log --oneline -10
git revert <bad-commit>
git push origin main
gh run list --workflow pages.yml --limit 5
```

After Pages succeeds, verify both the probe and the user-facing page:

```bash
npm run probe:freshness
```

Open the deployed dashboard and confirm that county selection, warning provenance, official links, and unavailable/fail-closed copy still work. Do not use a rollback to restore an expired artifact as current data.

## 4. Escalation record

For a persistent incident, record:

- first failing probe time and run URL;
- latest successful Pages run and deployed commit;
- CWA warning endpoint status/error;
- whether the site is fail-closed or serving a cache within 90 minutes;
- recovery/revert commit and post-recovery probe result.
