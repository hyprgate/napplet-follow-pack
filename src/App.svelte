<script lang="ts">
  import { onMount } from 'svelte';
  import { nip19 } from 'nostr-tools';
  import { pubkeyColorStyle, resourceImage } from '@hyprgate/utils';
  import {
    createFollowPackStore,
    selectedPack,
    type FollowPackState,
  } from './lib/follow-pack-store.js';
  import {
    subscribeProfileMetadata,
    type ProfileContent,
  } from './lib/profile-metadata.js';

  const store = createFollowPackStore(syncState);

  let state = $state<FollowPackState>({ ...store.state });
  let profiles = $state<Map<string, ProfileContent>>(new Map());

  const selected = $derived(selectedPack(state));

  function syncState(): void {
    state = {
      ...store.state,
      followedPubkeys: new Set(store.state.followedPubkeys),
      packs: [...store.state.packs],
    };
  }

  onMount(() => {
    store.load();
    return () => store.destroy();
  });

  $effect(() => {
    const pack = selected;
    profiles = new Map();
    if (!pack) return;

    const sub = subscribeProfileMetadata(pack.pubkeys, (pubkey, profile) => {
      profiles = new Map(profiles).set(pubkey, profile);
    });

    return () => sub.close();
  });

  function npub(pubkey: string): string {
    try {
      return nip19.npubEncode(pubkey);
    } catch {
      return pubkey;
    }
  }

  function shortNpub(pubkey: string): string {
    const value = npub(pubkey);
    return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
  }

  function profileName(pubkey: string): string {
    const profile = profiles.get(pubkey);
    return profile?.display_name ?? profile?.name ?? shortNpub(pubkey);
  }

  function placeholderImage(title: string): string {
    const safeTitle = title.replace(/[<&>"]/g, '').slice(0, 28) || 'Follow Pack';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#121816"/><path d="M0 288H640V360H0Z" fill="#1f3a33"/><circle cx="512" cy="96" r="72" fill="#5dd39e" opacity=".55"/><text x="40" y="196" fill="#d7ffe9" font-family="ui-monospace,monospace" font-size="34">Follow Pack</text><text x="40" y="242" fill="#96c8aa" font-family="ui-monospace,monospace" font-size="24">${safeTitle}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function backgroundImageStyle(url: string): string {
    return `background-image: url(${JSON.stringify(url)})`;
  }
</script>

<main class="follow-pack-shell">
  <header class="toolbar">
    <div>
      <p class="eyebrow">NIP-51 starter packs</p>
      <h1>Follow Packs</h1>
    </div>
    <button type="button" onclick={() => store.load()} disabled={state.loading}>Refresh</button>
  </header>

  {#if state.error}
    <p class="notice error">{state.error}</p>
  {/if}

  {#if state.status}
    <p class="notice">{state.status}</p>
  {/if}

  <section class="content">
    <div class="pack-list" aria-label="Follow packs">
      {#if state.loading && state.packs.length === 0}
        <p class="empty">Loading follow packs from outbox and super relays...</p>
      {:else if state.packs.length === 0}
        <p class="empty">No follow packs found yet.</p>
      {/if}

      {#each state.packs as pack (pack.id)}
        <article class:selected={selected?.id === pack.id} class="pack-card">
          <div
            class="cover"
            style={backgroundImageStyle(placeholderImage(pack.title))}
            role="img"
            aria-label={`${pack.title} cover`}
          >
            {#if pack.image}
              <img class="cover-image" use:resourceImage={pack.image} alt="" loading="lazy" />
            {/if}
          </div>
          <div class="pack-body">
            <button type="button" class="pack-title" onclick={() => store.select(pack.id)}>
              {pack.title}
            </button>
            <p>{pack.description || 'No description provided.'}</p>
            <p class="counts">
              <strong>{pack.newCount}</strong> new of <strong>{pack.totalCount}</strong> profiles
            </p>
            <button type="button" disabled={pack.newCount === 0 || state.publishing} onclick={() => store.followPack(pack)}>
              {pack.newCount === 0 ? 'All followed' : 'Follow all'}
            </button>
          </div>
        </article>
      {/each}
    </div>

    <aside class="detail" aria-label="Follow pack detail">
      {#if selected}
        <div class="detail-heading">
          <div>
            <p class="eyebrow">Pack detail</p>
            <h2>{selected.title}</h2>
            <p>{selected.newCount} new follows out of {selected.totalCount}</p>
          </div>
          <button type="button" disabled={selected.newCount === 0 || state.publishing} onclick={() => store.followPack(selected)}>
            Follow all
          </button>
        </div>

        <div class="profiles">
          {#each selected.pubkeys as pubkey (pubkey)}
            {@const profile = profiles.get(pubkey)}
            {@const alreadyFollowing = state.followedPubkeys.has(pubkey)}
            <article class="profile-row">
              <div class="avatar" style={pubkeyColorStyle(pubkey)} aria-hidden="true">
                <span>{profileName(pubkey).slice(0, 1).toUpperCase()}</span>
                {#if profile?.picture}
                  <img class="avatar-image" use:resourceImage={profile.picture} alt="" loading="lazy" />
                {/if}
              </div>
              <div class="profile-copy">
                <strong>{profileName(pubkey)}</strong>
                <code>{shortNpub(pubkey)}</code>
                {#if profile?.nip05}
                  <span>{profile.nip05}</span>
                {/if}
              </div>
              <button type="button" disabled={alreadyFollowing || state.publishing} onclick={() => store.followPubkey(pubkey)}>
                {alreadyFollowing ? 'Following' : 'Follow'}
              </button>
            </article>
          {/each}
        </div>
      {:else}
        <p class="empty">Select a follow pack to inspect individual profiles.</p>
      {/if}
    </aside>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: var(--hg-bg-base, #080b0a);
    color: var(--hg-text-primary, #eef8f1);
    font-family: var(--hg-font-body, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  }

  :global(button) {
    font: inherit;
  }

  .follow-pack-shell {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--hg-bg-base, #080b0a);
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--hg-border-default, #26332d);
    background: var(--hg-bg-surface, #101612);
  }

  h1, h2, p {
    margin: 0;
    letter-spacing: 0;
  }

  h1 {
    font-size: 18px;
  }

  h2 {
    font-size: 16px;
  }

  .eyebrow {
    color: var(--hg-accent-primary, #5dd39e);
    font-size: 11px;
    text-transform: uppercase;
  }

  button {
    border: 1px solid var(--hg-border-default, #31433b);
    border-radius: 6px;
    background: var(--hg-bg-elevated, #17211c);
    color: var(--hg-text-primary, #eef8f1);
    padding: 7px 10px;
    cursor: pointer;
  }

  button:hover:not(:disabled), button:focus-visible {
    border-color: var(--hg-accent-primary, #5dd39e);
    outline: none;
  }

  button:disabled {
    cursor: not-allowed;
    color: var(--hg-text-muted, #718078);
  }

  .notice {
    margin: 8px 12px 0;
    padding: 8px 10px;
    border: 1px solid var(--hg-border-default, #31433b);
    border-radius: 6px;
    color: var(--hg-text-secondary, #b5c7bd);
    background: var(--hg-bg-surface, #101612);
  }

  .notice.error {
    border-color: var(--hg-accent-danger, #ff6b6b);
    color: var(--hg-accent-danger, #ff6b6b);
  }

  .content {
    min-height: 0;
    flex: 1;
    display: grid;
    grid-template-columns: minmax(280px, 0.9fr) minmax(340px, 1.1fr);
  }

  .pack-list,
  .detail {
    min-height: 0;
    overflow: auto;
    padding: 12px;
  }

  .pack-list {
    border-right: 1px solid var(--hg-border-default, #26332d);
  }

  .pack-card {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 12px;
    padding: 10px;
    border: 1px solid var(--hg-border-default, #26332d);
    border-radius: 8px;
    background: var(--hg-bg-surface, #101612);
    margin-bottom: 10px;
  }

  .pack-card.selected {
    border-color: var(--hg-accent-primary, #5dd39e);
  }

  .cover {
    position: relative;
    overflow: hidden;
    width: 112px;
    aspect-ratio: 16 / 10;
    border-radius: 6px;
    background: var(--hg-bg-elevated, #17211c);
    background-size: cover;
    background-position: center;
  }

  .cover-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pack-body {
    min-width: 0;
    display: grid;
    gap: 7px;
    align-content: start;
  }

  .pack-title {
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    color: var(--hg-text-primary, #eef8f1);
    font-size: 15px;
    font-weight: 700;
  }

  .pack-body p,
  .detail p,
  .profile-copy span {
    color: var(--hg-text-secondary, #b5c7bd);
    font-size: 12px;
    line-height: 1.35;
  }

  .counts {
    color: var(--hg-text-primary, #eef8f1) !important;
  }

  .detail-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: start;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--hg-border-default, #26332d);
  }

  .profiles {
    display: grid;
    gap: 8px;
    padding-top: 12px;
  }

  .profile-row {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border: 1px solid var(--hg-border-default, #26332d);
    border-radius: 8px;
    background: var(--hg-bg-surface, #101612);
  }

  .avatar {
    position: relative;
    overflow: hidden;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--hg-bg-elevated, #17211c);
    display: grid;
    place-items: center;
    font-weight: 700;
    border: 1px solid currentColor;
  }

  .avatar span {
    position: relative;
    z-index: 0;
  }

  .avatar-image {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--hg-bg-elevated, #17211c);
  }

  .profile-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .profile-copy strong,
  .profile-copy code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-copy code {
    color: var(--hg-text-muted, #718078);
    font-size: 11px;
  }

  .empty {
    color: var(--hg-text-muted, #718078);
    padding: 16px;
  }

  @media (max-width: 760px) {
    .content {
      grid-template-columns: 1fr;
    }

    .pack-list {
      border-right: 0;
      border-bottom: 1px solid var(--hg-border-default, #26332d);
      max-height: 48vh;
    }

    .pack-card {
      grid-template-columns: 96px minmax(0, 1fr);
    }

    .cover {
      width: 96px;
    }
  }
</style>
