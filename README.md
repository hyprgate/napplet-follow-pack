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

## Testing

Run these checks from a Hyprgate parent checkout so shared workspace packages resolve:

```bash
pnpm --filter @hyprgate/napp-follow-pack test
pnpm --filter @hyprgate/napp-follow-pack type-check
pnpm --filter @hyprgate/napp-follow-pack build
```
