# PR Dashboard (consumer repo)

A thin repo that references the **dev-prism** engine to collect GitHub
pull-request data and publish an Explore + Reports dashboard. You hold only the
config and the accumulating data; the engine is referenced by version.

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

4. **Add a secret.** Settings → Secrets and variables → Actions →
   `GH_INSIGHTS_TOKEN` = a read-only PAT with access to the target repos.
   (GitHub forbids a secret literally named `GITHUB_TOKEN`; the workflow maps
   `GH_INSIGHTS_TOKEN` into the `GITHUB_TOKEN` env the engine reads.)

5. **Enable Pages.** Settings → Pages → Source = **GitHub Actions**.

6. Run the workflow (Actions → PR Dashboard → Run workflow). The first run can
   take a one-time `from` date to backfill history; later runs are incremental.

The dashboard appears at `https://<owner>.github.io/<repo>/`.

## How it works

- The **data action** (`__OWNER__/__REPO__@v1`) collects PRs and refreshes
  `data/dwh/` (committed parquet — the source of truth, accumulated over time).
- The **site action** (`__OWNER__/__REPO__/site@v1`) builds the static
  dashboard into `dist/` from that DWH.
- The workflow deploys `dist/` to GitHub Pages. For a custom domain or
  Cloudflare Pages, set the site action's `base` to `/` and point your host at
  the built `dist/` instead.

## Notes

- `data/dwh/` is committed and grows over time; the collection cursor
  self-heals from it, so a re-run always resumes where it left off (including
  after a GitHub rate limit).
- GitHub Enterprise Server: the runner sets `GITHUB_API_URL` /
  `GITHUB_GRAPHQL_URL` automatically; no extra config needed.
