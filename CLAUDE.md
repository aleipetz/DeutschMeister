# Instructions for Claude

## Merging

The owner has authorised Claude to merge its own pull requests in this repository without asking
first. Open a PR for each change, wait for the `Web app` CI checks to pass, then merge it. Merging to
`master` deploys `Web/` to GitHub Pages, so never merge while CI is red.

## Project

- The app that ships is the PWA in `Web/` (see `Web/README.md`). `iOS/` is the native app it was
  ported from and is no longer installed.
- After changing `Content/` or `Web/`, run `python3 Tools/build_web.py` and commit its output
  (CI fails otherwise), then `node --test Web/tests/*.test.mjs`.
