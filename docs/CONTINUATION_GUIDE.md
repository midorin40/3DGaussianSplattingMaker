# Continuation Guide

## Read First

- [README.md](/C:/WebApp/GaussianSplattingMaker/README.md)
- [docs/SPECIFICATION.md](/C:/WebApp/GaussianSplattingMaker/docs/SPECIFICATION.md)
- [data/local-stack.json](/C:/WebApp/GaussianSplattingMaker/data/local-stack.json)

## Current State

- The active runtime is the root `server.js`.
- The normal storage root is `data/runtime/`.
- Legacy data under `data/` and `data/v2/` is imported on startup if runtime storage is still empty.
- `old_archive/` remains as a fallback reference for the pre-runtime implementation.

## What Is Implemented

- Project CRUD
- Asset upload
- Job creation
- Pause / resume
- `.ply` and `.splat` export flow
- runtime status reporting
- file-based persistence

## What To Watch

- Keep `data/runtime/` as the source of truth for new work.
- Treat legacy `data/` and `data/v2/` as migration inputs only.
- If the runtime storage layout changes again, update both `storage/paths.js` and this guide together.

## Restart Reminder

If `server.js` changes, restart the Node process.

```powershell
netstat -ano | findstr :3200
Stop-Process -Id <PID> -Force
npm start
```

## Next Useful Work

1. Remove or archive leftover legacy data after confirming `data/runtime/` is complete.
2. Update the remaining archived `docs/V2_*.md` files to explicitly say they are historical references.
3. Add screenshots, usage notes, or a small benchmark section to make the portfolio presentation stronger.
