# old_archive

This directory stores the preserved `old` application baseline.

## Purpose

- Keep the old implementation runnable for comparison.
- Allow `v2` work to proceed without deleting the current working app.
- Make later cleanup explicit instead of implicit.

## Layout

- [server.js](/C:/WebApp/GaussianSplattingMaker/old_archive/server.js)
- [public](/C:/WebApp/GaussianSplattingMaker/old_archive/public)
- [scripts](/C:/WebApp/GaussianSplattingMaker/old_archive/scripts)

The old app reads runtime data from the root [data](/C:/WebApp/GaussianSplattingMaker/data) directory, but serves its own archived UI and script snapshot from `old_archive`.

## Current Bootstrap

- Root [server.js](/C:/WebApp/GaussianSplattingMaker/server.js) is now only a thin compatibility entrypoint.
- `npm start` still launches the old app.
- `npm run start:v2` is reserved for the new architecture.

## Cleanup Rule

Do not delete `old_archive` until:

- `v2` supports the required workflows,
- quality and stability are verified against the old baseline,
- and rollback is no longer needed.
