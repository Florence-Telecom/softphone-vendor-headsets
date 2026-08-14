# Florence fork maintenance

This patch line is based on upstream `v2.5.6`, commit
`35ac7f395068cfec5b72b01a4172bba66aa73bc9`.

It carries three Florence-specific fixes:

1. pass the configured application name into EPOS/Sennheiser registration;
2. give each EPOS WebSocket attempt explicit ownership and close superseded sockets;
3. prevent unselected vendor implementations from mutating or publishing headset state.

No npm publication or upstream pull request is expected. The package is marked private,
and Papaya consumes a full immutable commit over public GitHub HTTPS. Generated `dist/`
artifacts are intentionally tracked because every package entry point targets `dist/`
and Git installs must not require this repository's historical build toolchain.

## Verification and build

From the repository root:

```sh
npm ci
npm run lint
npm test
npx tsc -p . --noEmit
npm run build:src
npm run build:es
npm run build:module
npm pack --dry-run --json
```

When updating the fork, rebuild and commit all `dist/` artifacts, push the commit, and
replace Papaya's Git dependency with the new full 40-character commit SHA. Never pin a
consumer to a branch, moving tag, SSH URL, or local checkout.
