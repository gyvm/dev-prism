# PR Dashboard (consumer repo)

A thin repo that references the **dev-prism** engine to collect GitHub
pull-request data and publish an Explore dashboard. You hold only the config and
the accumulating data; the engine is referenced by version.

## Setup

1. **Copy this `template/` into a new repository** (or make it a GitHub
   "template repository" and click *Use this template*).

2. **Replace the engine reference.** In `.github/workflows/dashboard.yml`,
   replace `__OWNER__/__REPO__` with the engine repo you use, e.g.
   `your-org/dev-prism` (both occurrences — the data action and the
   `/site` action):

   ```bash
   sed -i 's#__OWNER__/__REPO__#your-org/dev-prism#g' .github/workflows/dashboard.yml
   # macOS (BSD sed) needs an empty backup arg: sed -i '' 's#...#...#g' ...
   ```

3. **Edit `config.toml`** — set `[repositories].include` to your repos
   (`["your-org/*"]` for everything under an owner).

4. **Choose an authentication method.** GitHub App is recommended for
   organizations and long-running installations; PAT remains supported for
   compatibility and quick local setup.

   For GitHub App authentication:

   - Register a GitHub App with `Metadata: Read-only` and
     `Pull requests: Read-only` repository permissions.
   - Install it on the target organization and select the repositories.
   - Add `DEV_PRISM_APP_ID` and `DEV_PRISM_INSTALLATION_ID` under **Settings →
     Secrets and variables → Actions → Variables**.
   - Add the downloaded PEM contents as the
     `DEV_PRISM_APP_PRIVATE_KEY` Actions secret.

   For PAT authentication, add `DEV_PRISM_GH_TOKEN` as an Actions secret with
   read-only access to the target repositories. The workflow contains both
   paths; use exactly one. If both are set, the PAT path takes precedence for
   backwards compatibility.

5. **Enable Pages.** Settings → Pages → Source = **GitHub Actions**.

6. Run the workflow (Actions → PR Dashboard → Run workflow). The first run can
   take a one-time `from` date to backfill history; later runs are incremental.

The dashboard appears at `https://<owner>.github.io/<repo>/`.

## How it works

- The **action** (`__OWNER__/__REPO__@v0`) collects PRs and refreshes
  `data/dwh/` (committed parquet — the source of truth, accumulated over time),
  then builds the static dashboard into `dist/` from that DWH — all in one step.
- The workflow commits `data/dwh/` and deploys `dist/` to GitHub Pages. For a
  custom domain or Cloudflare Pages, set the action's `base` to `/` and point
  your host at the built `dist/` instead.

## Notes

- `data/dwh/` is committed and grows over time; the collection cursor
  self-heals from it, so a re-run always resumes where it left off (including
  after a GitHub rate limit).
- GitHub Enterprise Server: the runner sets `GITHUB_API_URL` /
  `GITHUB_GRAPHQL_URL` automatically; no extra config needed.
- Multiple organizations can be collected with a GitHub App by setting
  the commented `github-app-installation-ids` input in
  `.github/workflows/dashboard.yml` to one `owner=installation_id` entry per
  line. Each organization must have its own installation ID.
