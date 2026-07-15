# Hackathon submission - your remaining tasks

Technical deploy is done. Complete these before **Jul 20, 2026 2:00pm PDT**.

## Done for you (no action needed)

- [x] RDS MySQL initialized on Alibaba Cloud (`john-ceo-rds`, ap-southeast-1)
- [x] Function Compute deployed with public HTTPS URL
- [x] Local `.env` pointed at Alibaba RDS
- [x] `npm run verify:deployed` passes
- [x] [`docs/JUDGE-TESTING.md`](JUDGE-TESTING.md) for Devpost testing field
- [x] [`docs/architecture.png`](architecture.png) for Devpost image upload (regenerate: `npx @mermaid-js/mermaid-cli -p docs/puppeteer-config.json -i docs/architecture.mmd -o docs/architecture.png`)
- [x] Smoke script fixed for SSE MCP responses
- [x] Blog article at `/articles/building-persistent-memory-with-qwen` (john.ceo)
- [x] Public repo URL: https://github.com/John-CEO-HQ/qwen-memory-mcp

---

## 1. Push code to public MIT repository

Devpost requires a **public** repo with MIT license visible in GitHub About.

**Repository:** https://github.com/John-CEO-HQ/qwen-memory-mcp (URL is ready; push code when ready)

```bash
# Example: subtree split from private monorepo, then push to the public remote
git subtree split --prefix=qwen-memory-mcp -b qwen-memory-mcp-export
git push git@github.com:John-CEO-HQ/qwen-memory-mcp.git qwen-memory-mcp-export:main
```

On GitHub: Public, MIT license in About, add topics `mcp`, `qwen`, `memory-agent`.

---

## 2. Demo video (under 3 minutes)

Record and upload to **YouTube or Vimeo** (public).

Suggested script:

| Time | Content |
|------|---------|
| 0:00-0:20 | Problem: agents forget across sessions |
| 0:20-0:40 | Show `docs/architecture.png` |
| 0:40-1:00 | Alibaba console: RDS + Function Compute (quick) |
| 1:00-1:30 | Terminal: `curl .../health` + `npm run verify:deployed` PASS |
| 1:30-2:00 | Optional: `npm run demo:live` |
| 2:00-2:30 | Recap: write, search, recall, forget |

No copyrighted music.

---

## 3. RDS persistence clip (optional but strong evidence)

```bash
cd qwen-memory-mcp
set -a && source .env && source .env.integration && set +a
npm run verify:deployed   # writes a memory
# wait 2+ min or redeploy FC
npm run verify:deployed   # search step must still find data
```

Screen-record this segment for the video or attach a screenshot to Devpost.

---

## 4. Devpost submission

1. Join: [qwencloud-hackathon.devpost.com](https://qwencloud-hackathon.devpost.com/)
2. Track: **Track 1 - MemoryAgent**
3. Fill in:
   - Public repo URL: https://github.com/John-CEO-HQ/qwen-memory-mcp
   - Video URL (step 2)
   - Architecture diagram: upload `docs/architecture.png`
   - Testing instructions: copy from [`JUDGE-TESTING.md`](JUDGE-TESTING.md); paste `MCP_AUTH_TOKEN` into Devpost field 16 only
   - Alibaba proof links: `src/qwen.ts`, `src/memory/mysql-store.ts`
   - Live demo: `https://qwen-memory-mcp-zvztgdreaw.ap-southeast-1.fcapp.run/health`
   - Blog post URL (bonus prize): `https://john.ceo/articles/building-persistent-memory-with-qwen`

4. Submit before deadline.

---

## 5. Blog post bonus (article published)

Article lives on john.ceo:

- Public URL after deploy: `https://john.ceo/articles/building-persistent-memory-with-qwen`

**You must:**

1. Merge/push the article to `dev` and deploy john.ceo (or run local build to preview).
2. Paste the john.ceo article URL into Devpost "Blog or Social Post" field.

---

## 6. After judging

- Rotate `MCP_AUTH_TOKEN` (FC env + `.env` + Devpost notes)
- Rotate RAM AccessKey if it was ever shared in chat
- Optional: tear down FC/RDS to save cost

---

## Quick reference

| Artifact | Location |
|----------|----------|
| Public repo | https://github.com/John-CEO-HQ/qwen-memory-mcp |
| Judge instructions | `docs/JUDGE-TESTING.md` |
| Architecture PNG | `docs/architecture.png` |
| Live URL | `https://qwen-memory-mcp-zvztgdreaw.ap-southeast-1.fcapp.run` |
| Verify command | `npm run verify:deployed` |
| Blog article | `https://john.ceo/articles/building-persistent-memory-with-qwen` |
