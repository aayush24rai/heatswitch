---
inclusion: always
---
# Workflow rules (apply after every task)
1. Only after an implementation task that changed code, and only if package.json exists:
   run `npx vitest run`. Skip this while writing specs. If it fails, fix it before moving on.
2. Append an entry to KIRO_LOG.md: time, task, which Kiro feature was used
   (spec, steering, hook, MCP, property-based test, CLI, power), what it did,
   and one line on why it mattered.
3. Only if the task changed UI and the dev server is running (npm run dev):
   use the Playwright MCP to open http://localhost:3000 at 1280px and 390px wide, take
   screenshots, and save them to docs/kiro/screens/<task>-desktop.png and <task>-mobile.png
   (copy them there if Playwright saves elsewhere). Reference them in the log entry.
4. End your reply with: "Commit and push now: <suggested commit message>".
Never read, print or edit .env.local. Never add .kiro to .gitignore.