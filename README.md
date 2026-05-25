# gotme instagram v0.2.0

Cloudflare Pages Direct Upload build.

## What changed

- Adds link-only mode for Instagram Reel URLs.
- Includes a Cloudflare Pages Function at `/api/analyze`.
- Function tries public metadata extraction only.
- No Instagram login, no DM access, no bypassing private posts.
- Keeps version check on load.
- Header includes Buy Me a Coffee link: https://buymeacoffee.com/sczahra

## Important limitation

This is a best-effort public-link experiment. It can summarize available caption/metadata, but it cannot guarantee audio transcription from a pasted Instagram link alone.
