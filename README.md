<!-- HYPRGATE NAPPLET MIRROR NOTICE:START -->
> This repository is a read-only mirror of the `follow-pack` napplet from `hyprgate/gui`.
> Open issues and pull requests in https://github.com/hyprgate/gui.
> Do not push commits to this standalone napplet repository; direct changes are overwritten by Hyprgate's mirror workflow.
<!-- HYPRGATE NAPPLET MIRROR NOTICE:END -->

# napplet-follow-pack

Forkable source repository for the Hyprgate built-in follow-pack napplet currently packaged as `@hyprgate/napp-follow-pack`.

This repository is mounted into the Hyprgate parent checkout as `napplets/follow-pack`.

## Parent checkout

```bash
git clone --recurse-submodules git@github.com:hyprgate/gui.git
cd gui
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
```
