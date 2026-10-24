# Decypharr — ioel fork

A public preview of an independently maintained [Decypharr](https://github.com/sirrobot01/decypharr) fork, focused on symlink repairing library audit, recovery workflows, and a sleek React interface.

Decypharr is a media gateway written in Go that connects Sonarr, Radarr, and other Arr applications to Debrid providers and Usenet. This fork builds on sirrobot01's work; it is maintained by [ioeldev](https://github.com/ioeldev) and is not an official upstream release. Development happens on [`ioel/beta`](https://github.com/ioeldev/decypharr/tree/ioel/beta).

**Preview status:** expect changes to the interface, repair behavior, and persistent state. Start with a backed-up installation and a detection-only audit before enabling automatic repairs. Report fork-specific problems to [this fork's issue tracker](https://github.com/ioeldev/decypharr/issues).

## What this fork adds

- **React interface:** React, Vite, TypeScript, and shadcn components replace the Go HTML templates. Includes responsive navigation, light/dark themes, and common/advanced settings views. Assets are embedded in the Go binary; no frontend service is needed in production.
- **Library read audits:** sample-read files imported by Sonarr/Radarr to find broken paths and symlink targets, including media whose original torrent is no longer tracked by Decypharr. Run audits manually or schedule full audits.
- **Library repair tracking:** persistent incidents with diagnosis, season grouping, filtering, pagination, recheck/repair actions, retry timing, and suspend/resume controls.
- **Durable recovery queue:** dispatch intervals, batch cooldowns, active-job limits, bounded concurrent searches, pause/resume, and retries that survive restarts. Follow recovery through search, download, import, and a confirming library read.
- **Season-aware recovery:** prefer Sonarr season packs with episode-search fallback. Optional whole-season replacement can recover a season after a confirmed broken episode.
- **Cache rejection recovery:** recognize explicit provider-cache rejections, try eligible alternatives, and schedule retries without keeping an active repair slot occupied indefinitely.
- **Optional uncached recovery:** opt-in fallback for Real-Debrid, TorBox, and AllDebrid, with separate capacity limits, progress tracking, and stall detection. Disabled by default; provider availability and limits still apply.

A successful audit reads the first **64 KiB**; it does not validate an entire file or guarantee playback. Audits cover imported files recorded in Sonarr/Radarr, not every loose symlink on disk. **Imported** and **Readable** are separate outcomes. See the [fork repair guide](docs/src/content/docs/guides/repair.mdx) for behavior, settings, and limitations.

## Core Decypharr capabilities

Inherited from upstream:

- qBittorrent and SABnzbd-compatible APIs for Arr applications.
- Multiple Debrid providers: [Real-Debrid](https://real-debrid.com), [TorBox](https://torbox.app), [Debrid-Link](https://debrid-link.com), [AllDebrid](https://alldebrid.com), and [Premiumize](https://www.premiumize.me).
- Direct Usenet streaming over NNTP.
- Library access through mounts, read-only NFSv4 and SMB, and custom virtual folders.

## Install the preview with Docker Compose

Use a Linux Docker host with Docker Compose and `/dev/fuse` available for the mount configuration below. The preview image supports **linux/amd64** and **linux/arm64**.

### 1. Choose the fork image

Fork images are published to **`ghcr.io/ioeldev/decypharr`**. Use a pinned digest so an update is deliberate. The following image was published from commit [`ca1b2698b4e381f2f1f517b49e47d42846c09aa7`](https://github.com/ioeldev/decypharr/commit/ca1b2698b4e381f2f1f517b49e47d42846c09aa7) on October 24, 2026; [build and provenance](https://github.com/ioeldev/decypharr/actions/runs/40069888388).

Create an installation directory and a `configs` subdirectory. Save this as `.env` in the installation directory:

```dotenv
DECYPHARR_IMAGE=ghcr.io/ioeldev/decypharr@sha256:c3cc19872f8e7ba3a0740fa38eda3021736be962edfd3c35043c88ff1bdc3d52
```

New builds have unique `sha-<commit>-run-<run-id>-<attempt>` tags. For a later build, use the digest and source repository/ref recorded in the [Build GHCR image workflow](https://github.com/ioeldev/decypharr/actions/workflows/ghcr-manual.yml) summary. That workflow can also build upstream source: select a successful **ioeldev/decypharr** build from **ioel/beta** for this preview. There is no rolling `latest` or `preview` tag from this workflow.

### 2. Create `compose.yaml`

```yaml
services:
  decypharr:
    image: ${DECYPHARR_IMAGE:?Set DECYPHARR_IMAGE in .env}
    container_name: decypharr
    ports:
      - "8282:8282"
      # Optional: enable NFS or SMB in Settings before exposing their ports.
      # - "2049:20490/tcp"
      # - "445:1445/tcp"
    environment:
      PUID: "1000"
      PGID: "1000"
      TZ: Etc/UTC
    volumes:
      - ./configs:/app
      - /mnt:/mnt:rshared
    devices:
      - /dev/fuse:/dev/fuse:rwm
    cap_add:
      - SYS_ADMIN
    security_opt:
      - apparmor:unconfined
    restart: unless-stopped
```

Set `PUID`/`PGID` to a user/group with access to your library, and `TZ` to the timezone you want scheduled audits to use. Adapt `/mnt` to your media layout and host mount-propagation configuration. **Sonarr/Radarr library paths and absolute symlink targets must resolve at the same paths inside Decypharr.** For example, an Arr path of `/data/media/tv` requires a matching `/data/media` mount here if it is outside `/mnt`. Missing or differently mapped mounts can make an audit inconclusive.

### 3. Start and configure

From the installation directory:

```sh
mkdir -p configs
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose logs --tail=100 -f decypharr
```

Open `http://YOUR_DOCKER_HOST:8282`, complete registration/setup as prompted, and configure your provider and Arr connections. When adding Decypharr to Sonarr/Radarr, use a hostname reachable from those applications; `localhost` in another container points to that container itself. Enable optional NFS/SMB only if your setup needs them.

### 4. Run a detection-only audit

Check library mounts and permissions first. Go to **Repair → Health checks → Run a health check**, enable **Audit imported library files**, and turn **Automatically repair** off for the initial run. Inspect the findings before choosing **Repair all broken entries** or enabling scheduled automatic repairs.

Recovery can delete broken imported-file records/files through Sonarr/Radarr and request replacements. **Replace Whole Season** can replace all imported files in an affected season. A finished audit or repair-submission run does not mean replacement downloads and imports have finished; follow the recovery queue and confirm readability.

The uncached fallback is a separate opt-in setting, `repair.uncached_recovery_fallback`. Its default capacity is one uncached recovery, with a two-hour stall timeout; adjust `repair.max_uncached_recoveries` and `repair.uncached_stall_timeout` if needed. These controls are separate from regular cached repair dispatch limits.

## Upgrade and rollback

For an existing installation:

1. Record the current image digest and stop Decypharr before taking a consistent backup of its **entire `/app` data directory**, including configuration, authentication, job databases, and repair queue state. Preserve the old Compose file and image reference too.
2. Keep your existing paths, mounts, and credentials. Change the service image to the selected fork digest, then run `docker compose pull` and `docker compose up -d` from that installation's directory. Run only one Decypharr instance against a data directory.
3. Check logs, authentication, provider/Arr connections, mount access, and a detection-only audit before enabling further repair actions. Review existing recovery jobs: persisted work can resume independently of the audit schedule.

This preview introduces persisted recovery states, including cache-rejection and uncached-recovery records, that older builds may not understand. **Rollback requires the old image and its matching pre-upgrade data snapshot**, not just switching the image back. Stop Decypharr before restoring the snapshot. Restoring local state does not undo Arr/provider operations already performed; reconcile those before restarting recovery. Compatibility with every upstream configuration and external API consumer has not been established.

## Documentation and feedback

- [Fork repair guide](docs/src/content/docs/guides/repair.mdx): library audits, repair tracking, queue policies, and recovery outcomes.
- [Upstream documentation](https://docs.decypharr.com): background on shared provider, mount, and Arr integrations. Its screenshots and instructions may differ from this fork.
- [Fork issues](https://github.com/ioeldev/decypharr/issues): preview bugs and feature requests. Include the image digest/commit, affected provider/Arr, and reproduction steps; remove API keys, tokens, and other credentials from logs and configuration.

Focused contributions are welcome. For larger changes, open an issue in this fork to agree on scope. Upstream contributions are discussed and submitted separately.

## Attribution and license

Based on [Decypharr by sirrobot01 and contributors](https://github.com/sirrobot01/decypharr). The original copyright and MIT license are retained in [LICENSE](LICENSE). This fork's preview releases and support are maintained independently by ioeldev.

## GUI development

The GUI uses React, Vite, and Bun. React Router Data mode declares the routes in
`web/src/app/router.tsx`, with a shared `<Outlet />` layout and a session loader.
Pages, components, and API behavior live together under `web/src/domains`.
The small fetch wrapper in `web/src/shared/api/client.ts` handles the deployment
prefix, JSON, cookies, and errors. TanStack Query owns server data, deduplication,
polling, and mutation invalidation. Domain `*.queries.ts` files declare query keys
and options, and the owning components call `useQuery` and `useMutation` directly.

Query defaults live in `web/src/app/query-client.ts`. Reads use a short freshness
window and at most one retry for network/server errors; mutations never retry or
queue themselves for later execution when offline. Repair actions invalidate the
repair views, and settings drafts stay local so refetches cannot replace unsaved
edits. The route loader checks authentication afresh and clears protected cached
data when the session is no longer authorized.

```sh
bun install --frozen-lockfile
bun run build
# Start the Go backend using your normal development configuration, then:
bun run dev
```

Vite serves the GUI at `http://localhost:5173` and proxies API requests to `http://localhost:8282`. Set `DECYPHARR_BACKEND_URL` to change the
backend address. The development proxy assumes the backend uses the default
`url_base` of `/`; use the Go-served build when checking a custom URL prefix.

Run `bun run check` for TypeScript checks and `bun run test:web` for frontend tests.
For browser smoke tests, install Chromium with `cd web && bunx playwright install chromium`,
then run `bun run build` and `bun run test:browser` from the repository root. These
tests use mock API responses and exercise every route at both `/` and `/base/`.

Production builds must run `bun run build` **before** `go build`. Go embeds
`web/dist` and serves it on the same origin as the API, using the configured
`url_base` at runtime. Docker and standalone release workflows build these assets
automatically; the deployed application does not need Bun or Node.js.
