# is-my.app

Free subdomains for developers: get `yourname.is-my.app` with a pull request.

Point it at anything you already host (GitHub Pages, Vercel, Netlify, Cloudflare Pages, your own server), or give us a public GitHub repo and we build and host it for you on Cloudflare Pages.

Browse taken names at [is-my.app](https://is-my.app).

## Claim a subdomain

1. Fork this repository.
2. Add `domains/<name>.json`. The file name is your subdomain: `domains/bob.json` claims `bob.is-my.app`.
3. Open a pull request. A bot validates it and comments with the result.
4. Once merged, your subdomain is live within a few minutes.

Your editor autocompletes the format if you keep the `$schema` line.

### Option 1: point DNS somewhere

```json
{
  "$schema": "../schema/domain.schema.json",
  "owner": { "github": "your-username", "email": "optional@example.com" },
  "description": "My personal wiki",
  "records": { "CNAME": "your-username.github.io" }
}
```

| Type    | Value                                                                  |
| ------- | ---------------------------------------------------------------------- |
| `A`     | Array of public IPv4 addresses                                         |
| `AAAA`  | Array of public IPv6 addresses                                         |
| `CNAME` | A single hostname. Cannot be combined with any other type              |
| `MX`    | Array of hostnames, or `{ "target": "mx.example.com", "priority": 10 }` |
| `TXT`   | A string or an array of strings                                        |

Set `"proxied": true` to put Cloudflare's proxy (CDN, TLS) in front of an `A`, `AAAA` or `CNAME` record. Only top-level names can be proxied.

### Option 2: we build and host your repo

```json
{
  "$schema": "../schema/domain.schema.json",
  "owner": { "github": "your-username" },
  "description": "My portfolio",
  "deploy": {
    "repo": "your-username/portfolio",
    "branch": "main",
    "build": "npm ci && npm run build",
    "output": "dist"
  }
}
```

| Field    | Default  | Meaning                                                            |
| -------- | -------- | ------------------------------------------------------------------ |
| `repo`   | required | Public GitHub repository, `owner/name`                             |
| `branch` | `main`   | Branch to build                                                    |
| `build`  | empty    | Build command. Leave empty if the files are already static         |
| `output` | `.`      | Folder with the built site, relative to `root`                     |
| `root`   | `.`      | Folder the build runs in (useful for monorepos)                    |
| `node`   | `22`     | Node.js version                                                    |

Hosted sites are redeployed automatically, within about an hour, whenever your branch gets new commits.

## Rules

- One file per name, lowercase `a-z`, `0-9` and `-`. Reserved names (see [`config/reserved.json`](config/reserved.json)) cannot be claimed.
- `owner.github` must be the account that opens the pull request. Only the owner can change or remove a domain.
- Your GitHub account must be at least 14 days old.
- Up to 5 top-level subdomains per person. Nested names do not count.
- Nested names like `docs.bob.is-my.app` (`domains/docs.bob.json`) are allowed if you own `bob`. Nested labels may start with `_` for verification records, like `_dmarc.bob`.
- Records must point to public addresses, and a `CNAME` cannot point back into `is-my.app`.
- No unknown keys: the validator is strict so typos are caught early.
- Everything must follow the [terms](TERMS.md). No phishing, malware or illegal content.

## Using a hosting provider

Most hosts need to know about your custom domain before they will serve it:

- **GitHub Pages:** set the custom domain in your repository settings, then use `"CNAME": "your-username.github.io"`. To verify the domain, add a TXT record as a nested name, e.g. `domains/_github-pages-challenge-your-username.bob.json` with `"records": { "TXT": "<code from GitHub>" }`.
- **Vercel / Netlify:** add `bob.is-my.app` as a domain in the project first, then use the `CNAME` (or `TXT` verification record) they show you.
- **Cloudflare Pages (your own account):** add the custom domain in your Pages project, then point a `CNAME` at `<project>.pages.dev`.

## How it works

```mermaid
flowchart LR
  PR[Pull request adds domains/name.json] --> V[Validate PR: schema, ownership, limits]
  V -->|bot comment| PR
  V --> M{Merged}
  M --> DNS[Sync DNS to Cloudflare]
  M --> P{deploy entry?}
  P -->|yes| B[Build repo in isolated container, no secrets]
  B --> D[Upload static files to Cloudflare Pages]
  D --> L[name.is-my.app]
  DNS --> L
```

- `validate.yml` runs on every pull request. It never runs code from the PR: it reads the changed JSON files through the GitHub API and posts one comment that updates on every push.
- `publish.yml` runs on merge. It reconciles Cloudflare DNS with `domains/`, builds hosted repos, and deploys them. It only touches DNS records it created (tagged with the comment `is-my.app:managed`).
- `site.yml` builds and deploys the website in `web/`.

### Hosted deploy limits

- Static output only. `_worker.js`, `_routes.json` and `functions/` are removed.
- Builds run in the official `node:<version>` Docker image as a non-root user, with a 15 minute limit and no secrets. Use `npx` or `corepack pnpm ...` / `corepack yarn ...` rather than global installs.
- At most 20,000 files, each at most 25 MiB. Symlinks are dropped.
- Redeployed hourly when your branch changes.
- Cloudflare Pages has a soft limit of 100 projects per account, so hosted slots are limited and reviewed by a maintainer.

## Maintainer setup

1. Add the zone `is-my.app` to Cloudflare.
2. Create an API token with:
   - Account > Cloudflare Pages > Edit
   - Zone > DNS > Edit (zone `is-my.app`)
   - Zone > Zone > Read (zone `is-my.app`)
3. Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Optional: set the repository variable `AUTO_MERGE` to `true` to auto-merge valid DNS-only PRs (hosted deploys always wait for review). This needs "Allow GitHub Actions to create and approve pull requests" and branch rules that let `github-actions` merge.
5. Remove any parking records at the apex before the first site deploy, or run once:
   `node scripts/pages-attach.mjs is-my-app is-my.app --comment is-my.app:site --force`

Useful commands (all support `DRY_RUN=1`, which reads from Cloudflare but changes nothing):

```sh
npm test                                   # unit tests
npm run validate                           # validate domains/
DRY_RUN=1 npm run sync                     # show the DNS plan
PLAN_MODE=all npm run plan                 # list hosted deploy targets
DRY_RUN=1 node scripts/pages-gc.mjs        # list orphaned Pages projects
```

Run the `Publish` workflow manually with `target` set to `all`, `changed`, `dns` or `name:<subdomain>`. Running it with `all` also deletes Pages projects that no longer have a domain file.

## Reporting abuse

Open an [abuse report](https://github.com/jn-aman/is-my.app/issues/new?template=report-abuse.yml) with the subdomain and what is wrong. For anything sensitive, contact the maintainer privately through [GitHub](https://github.com/jn-aman). Domains that break the [terms](TERMS.md) are removed without notice.

## License

[MIT](LICENSE) © 2026 Aman Jain
