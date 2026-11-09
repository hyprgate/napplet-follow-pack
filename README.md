<!-- HYPRGATE NAPPLET MIRROR NOTICE:START -->
> This repository is a read-only mirror of the `follow-pack` napplet from `hyprgate/gui`.
> Open issues and pull requests in https://github.com/hyprgate/gui.
> Do not push commits to this standalone napplet repository; direct changes are overwritten by Hyprgate's mirror workflow.
<!-- HYPRGATE NAPPLET MIRROR NOTICE:END -->

# Follow Packs

Discover lists of people put together by others (kind 39089) and follow a whole
list or a few of them.

This app is tracked directly in the Hyprgate workspace at `napplets/follow-pack`.
Standalone repositories are generated read-only mirrors; make changes and run
workspace checks in the existing Hyprgate checkout.

## Parent checkout

```bash
pnpm install --frozen-lockfile
pnpm --filter @hyprgate/napp-follow-pack build
```

## Paja runtime

```bash
pnpm --filter @hyprgate/napp-follow-pack paja
```

This starts Kehto Paja and the napplet's Vite dev server together, using
the port configured in `vite.config.ts`.

## Testing

Run these checks from a Hyprgate parent checkout so shared workspace packages resolve:

```bash
pnpm --filter @hyprgate/napp-follow-pack test
pnpm --filter @hyprgate/napp-follow-pack type-check
pnpm --filter @hyprgate/napp-follow-pack build
pnpm --filter @hyprgate/napp-follow-pack conformance
```

The `conformance` script builds the app and runs `@napplet/conformance-cli` against
`dist/`, same as the other apps.

## How following works

Following publishes your kind-3 list with the new people added. The app merges the
latest list it can find with the follows the shell already knows, so a missed relay
doesn't drop anyone. You're never counted as someone to follow, even when a pack
lists you. Profile metadata loads as cards come into view.
