# Discussion draft: React UI and library audit/recovery work in an independent fork

Suggested venue: [Decypharr Discussions](https://github.com/sirrobot01/decypharr/discussions). This is an unpublished draft for review.

---

Hi @sirrobot01, thanks for building Decypharr. I've been extending it for my own setup, and the work has grown into a substantial fork. Before opening large PRs, I'd like to ask which parts, if any, fit your plans for upstream.

The fork is **Decypharr — ioel fork**, with development on [ioeldev/decypharr, branch ioel/beta](https://github.com/ioeldev/decypharr/tree/ioel/beta). I'm preparing it as an independently maintained public preview, with its own image and support, while keeping upstream attribution clear.

## What changed

**Frontend:** I replaced the Go HTML templates and existing browser scripts with React, Vite, TypeScript, and shadcn components. The interface covers setup/authentication, downloads, browsing, repair/recovery, statistics, and settings, with responsive navigation and light/dark themes. TanStack Query handles server state. Production assets remain embedded in the Go binary and served by Go; Bun is needed during the build, with no additional frontend service in deployment.

**Library audits and repair:** The fork can enumerate imported Sonarr/Radarr files and sample-read their actual library paths, including symlinks whose original torrent is no longer tracked by Decypharr. It adds scheduled full audits, persistent incident tracking, and per-incident recheck, repair, retry, and suspend/resume controls. These checks validate a 64 KiB sample, not an entire media file, and depend on matching container paths and working mounts.

**Recovery:** I've added durable repair dispatch controls, bounded concurrent searches, batch cooldowns, active-job limits, pause/resume, and persisted retries. Sonarr recovery prefers season packs with episode fallback, with an optional whole-season replacement mode. The UI separates recovery submission, download/import progress, and confirmed library readability.

**Provider/cache behavior:** Recovery recognizes explicit cache rejections and tries eligible alternatives or schedules a retry. There's also an opt-in uncached fallback for Real-Debrid, TorBox, and AllDebrid, with capacity limits, progress observation, and stall handling.

The [fork README](https://github.com/ioeldev/decypharr/blob/ioel/beta/README.md) covers installation and preview limitations. The [repair guide](https://github.com/ioeldev/decypharr/blob/ioel/beta/docs/src/content/docs/guides/repair.mdx) describes the audit/recovery behavior in more detail.

## Scope and compatibility

This is a frontend architecture change plus several backend features, so it would require a substantial review and ongoing maintenance commitment. The React migration also changes the build pipeline, GUI routing, and server endpoints used by the interface. I haven't established compatibility with every existing setup or external API consumer.

The backend work includes tests for audit behavior, queue/recovery policies, cache rejections, and provider recovery. The frontend includes unit tests and browser smoke tests; the smoke tests use mocked API responses and are not proof of live provider/Arr compatibility.

Repair actions can mutate Arr library state and request replacement downloads, including optional whole-season replacement. New persisted recovery states mean older builds may need a matching pre-upgrade data backup for rollback. I want those implications to be explicit before proposing anything for upstream.

## What would be useful upstream?

1. Are you interested in a React-based interface, or do you prefer keeping the current template approach?
2. Independently of the interface, would library read audits, repair queue controls, season-aware recovery, or cache/provider recovery fixes be useful?
3. For anything you're interested in, what boundaries and target branch would you prefer for focused PRs?

I can prepare focused proposals for the parts that fit, with their dependencies and validation made clear. I understand if the broader direction doesn't match your plans; in that case I'll keep maintaining it as a clearly identified fork. There's no expectation that you take ownership of the whole branch.

Thanks again for the foundation, and I'd appreciate your thoughts before I spend time packaging this into upstream PRs.
