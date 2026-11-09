<script lang="ts">
  import { onMount, tick } from 'svelte';
  import * as nip19 from 'nostr-tools/nip19';
  import { parseIntentResult } from '@hyprgate/types';
  import { invokeNappletIntent, createProfileIntentRequest, pubkeyColorStyle, resourceImage } from '@hyprgate/utils';
  import {
    createFollowPackStore,
    selectedPack,
    type FollowPackState,
  } from './lib/follow-pack-store.js';
  import { followAllLabel, packProgress, type FollowPackSummary } from './lib/follow-pack.js';
  import {
    subscribeProfileMetadata,
    type ProfileContent,
  } from './lib/profile-metadata.js';
  import type { Subscription } from '@napplet/sdk';

  const FACES_ON_CARD = 5;
  const store = createFollowPackStore(syncState);

  let state = $state<FollowPackState>({ ...store.state });
  let profiles = $state<Map<string, ProfileContent>>(new Map());
  let detailOpen = $state(false);
  let visiblePackIds = $state(new Set<string>());

  const selected = $derived(detailOpen ? selectedPack(state) : null);
  const watchedPubkeys = new Set<string>();
  const profileSubs: Subscription[] = [];

  function syncState(): void {
    state = {
      ...store.state,
      followedPubkeys: new Set(store.state.followedPubkeys),
      packs: [...store.state.packs],
    };
  }

  onMount(() => {
    store.load();
    return () => {
      store.destroy();
      for (const sub of profileSubs) sub.close();
    };
  });

  /** Metadata only for what's on screen, so a long list of packs stays light. */
  function loadProfiles(pubkeys: string[]): void {
    const fresh = pubkeys.filter((pubkey) => !watchedPubkeys.has(pubkey));
    if (fresh.length === 0) return;
    for (const pubkey of fresh) watchedPubkeys.add(pubkey);
    profileSubs.push(subscribeProfileMetadata(fresh, (pubkey, profile) => {
      profiles = new Map(profiles).set(pubkey, profile);
    }));
  }

  $effect(() => {
    const wanted: string[] = [];
    for (const pack of state.packs) {
      if (visiblePackIds.has(pack.id)) wanted.push(pack.author, ...pack.pubkeys.slice(0, FACES_ON_CARD));
    }
    if (selected) wanted.push(selected.author, ...selected.pubkeys);
    loadProfiles(wanted);
  });

  function trackVisible(node: HTMLElement, packId: string) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !visiblePackIds.has(packId)) {
        visiblePackIds = new Set(visiblePackIds).add(packId);
      }
    }, { rootMargin: '200px' });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

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

  function knownName(pubkey: string): string | null {
    const profile = profiles.get(pubkey);
    return profile?.display_name ?? profile?.name ?? profile?.nip05 ?? null;
  }

  function profileName(pubkey: string): string {
    return knownName(pubkey) ?? shortNpub(pubkey);
  }

  function viewDetails(packId: string): void {
    store.clearNotices();
    store.select(packId);
    detailOpen = true;
  }

  async function closeDetails(): Promise<void> {
    const packId = selected?.id;
    store.clearNotices();
    detailOpen = false;
    await tick();
    // Back lands on the card you came from.
    if (packId) document.querySelector<HTMLElement>(`[data-pack-details="${packId}"]`)?.focus();
  }

  async function openProfile(pubkey: string): Promise<void> {
    const request = createProfileIntentRequest({ pubkey });
    if (!request) return;
    try {
      const result = parseIntentResult(await invokeNappletIntent(request));
      if (!result || result.archetype !== request.archetype || result.action !== (request.action ?? 'open')) return;
      if (!result.ok) return;
    } catch {
      // Keep the existing no-op behavior when profile navigation is unavailable.
    }
  }
</script>

{#snippet avatar(pubkey: string, size: 'small' | 'large')}
  <button
    type="button"
    class="avatar {size}"
    style={pubkeyColorStyle(pubkey)}
    title={profileName(pubkey)}
    aria-label="Open profile for {profileName(pubkey)}"
    onclick={() => openProfile(pubkey)}
  >
    <span>{profileName(pubkey).slice(0, 1).toUpperCase()}</span>
    {#if profiles.get(pubkey)?.picture}
      <img class="avatar-image" use:resourceImage={profiles.get(pubkey)?.picture} alt="" loading="lazy" />
    {/if}
  </button>
{/snippet}

{#snippet byline(pack: FollowPackSummary)}
  <p class="byline">
    By <button type="button" class="person-link" style={pubkeyColorStyle(pack.author)} onclick={() => openProfile(pack.author)}>{profileName(pack.author)}</button>
  </p>
{/snippet}

{#snippet followAll(pack: FollowPackSummary)}
  {#if pack.newCount === 0}
    <span class="all-followed" role="status">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      You follow everyone here
    </span>
  {:else}
    <button type="button" class="primary" disabled={state.publishing} onclick={() => store.followPack(pack)}>
      {state.publishing ? 'Following...' : followAllLabel(pack)}
    </button>
  {/if}
{/snippet}

<main class="follow-pack-shell">
  <header class="toolbar">
    <div>
      <h1>Follow Packs</h1>
      <p class="intro">Lists of people put together by others. Follow a whole list, or pick a few.</p>
    </div>
    <button type="button" class="quiet" onclick={() => store.load()} disabled={state.loading}>
      {state.loading ? 'Looking...' : 'Refresh'}
    </button>
  </header>

  {#if state.error}
    <p class="notice error" role="alert">{state.error}</p>
  {/if}

  {#if state.status}
    <p class="notice" role="status">{state.status}</p>
  {/if}

  {#if selected}
    <section class="detail-view" aria-label="Follow pack detail">
      <div class="detail-heading">
        <button type="button" class="quiet" onclick={closeDetails}>Back</button>
        <div class="detail-title">
          <h2>{selected.title}</h2>
          {@render byline(selected)}
          {#if selected.description}<p>{selected.description}</p>{/if}
          <p class="counts">{packProgress(selected)}</p>
        </div>
        {@render followAll(selected)}
      </div>

      <div class="profiles">
        {#each selected.pubkeys as pubkey (pubkey)}
          {@const profile = profiles.get(pubkey)}
          {@const alreadyFollowing = state.followedPubkeys.has(pubkey)}
          {@const isSelf = pubkey === state.self}
          <article class="profile-row">
            {@render avatar(pubkey, 'large')}
            <div class="profile-copy">
              <button type="button" class="profile-name" style={pubkeyColorStyle(pubkey)} title={npub(pubkey)} onclick={() => openProfile(pubkey)}>
                {profileName(pubkey)}
              </button>
              {#if profile?.nip05 && profile.nip05 !== knownName(pubkey)}
                <span>{profile.nip05}</span>
              {/if}
              {#if knownName(pubkey)}
                <code>{shortNpub(pubkey)}</code>
              {/if}
            </div>
            {#if isSelf}
              <span class="row-state">This is you</span>
            {:else if alreadyFollowing}
              <span class="row-state followed">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                Following
              </span>
            {:else}
              <button type="button" disabled={state.publishing} onclick={() => store.followPubkey(pubkey)}>Follow</button>
            {/if}
          </article>
        {/each}
      </div>
    </section>
  {:else}
    <section class="pack-grid" aria-label="Follow packs">
      {#if state.loading && state.packs.length === 0}
        <p class="empty" role="status">Looking for follow packs on your relays...</p>
      {:else if state.packs.length === 0}
        <p class="empty">No follow packs on your relays yet. Try Refresh in a bit.</p>
      {/if}

      {#each state.packs as pack (pack.id)}
        {@const hiddenFaces = Math.max(0, pack.totalCount - FACES_ON_CARD)}
        <article class="pack-card" use:trackVisible={pack.id}>
          <div class="cover" class:fallback={!pack.image} aria-hidden="true">
            {#if pack.image}
              <img class="cover-image" use:resourceImage={pack.image} alt="" loading="lazy" />
            {:else}
              <span class="cover-initial">{pack.title.slice(0, 1).toUpperCase()}</span>
            {/if}
          </div>
          <div class="pack-body">
            <h2>{pack.title}</h2>
            {@render byline(pack)}
            {#if pack.description}<p>{pack.description}</p>{/if}
            <div class="faces">
              {#each pack.pubkeys.slice(0, FACES_ON_CARD) as pubkey (pubkey)}
                {@render avatar(pubkey, 'small')}
              {/each}
              {#if hiddenFaces > 0}<span class="more-faces">+{hiddenFaces}</span>{/if}
            </div>
            <p class="counts">{packProgress(pack)}</p>
            <div class="pack-actions">
              {@render followAll(pack)}
              <button type="button" class="quiet" data-pack-details={pack.id} onclick={() => viewDetails(pack.id)}>See who's in it</button>
            </div>
          </div>
        </article>
      {/each}
    </section>
  {/if}
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

  button {
    border: 1px solid var(--hg-border-default, #31433b);
    border-radius: 6px;
    background: var(--hg-bg-elevated, #17211c);
    color: var(--hg-text-primary, #eef8f1);
    padding: 7px 10px;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: var(--hg-accent-primary, #5dd39e);
  }

  button:focus-visible {
    outline: 2px solid var(--hg-accent-focus, var(--hg-accent-primary, #5dd39e));
    outline-offset: 1px;
  }

  .primary {
    border-color: var(--hg-accent-primary, #5dd39e);
    background: var(--hg-accent-primary, #5dd39e);
    color: var(--hg-bg-base, #080b0a);
    font-weight: 600;
  }

  .primary:hover:not(:disabled) {
    opacity: 0.88;
  }

  .quiet {
    background: transparent;
  }

  .intro,
  .byline {
    color: var(--hg-text-secondary, #b5c7bd);
    font-size: 12px;
  }

  .person-link {
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    font-size: inherit;
  }

  .person-link:hover {
    text-decoration: underline;
  }

  .all-followed,
  .row-state {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--hg-text-secondary, #b5c7bd);
    font-size: 12px;
  }

  .all-followed {
    color: var(--hg-text-primary, #eef8f1);
  }

  .all-followed svg,
  .row-state svg {
    flex: none;
    width: 14px;
    height: 14px;
    fill: none;
    stroke: var(--hg-accent-primary, #5dd39e);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .faces {
    display: flex;
    align-items: center;
    padding-left: 6px;
  }

  .faces .avatar {
    margin-left: -6px;
    outline-offset: 0;
  }

  .more-faces {
    margin-left: 6px;
    color: var(--hg-text-muted, #718078);
    font-size: 11px;
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

  .pack-grid {
    min-height: 0;
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    align-content: start;
    gap: 12px;
    overflow: auto;
    padding: 12px;
  }

  .detail-view {
    min-height: 0;
    flex: 1;
    overflow: auto;
    padding: 12px;
  }

  .pack-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px;
    border: 1px solid var(--hg-border-default, #26332d);
    border-radius: 8px;
    background: var(--hg-bg-surface, #101612);
  }

  .cover {
    position: relative;
    overflow: hidden;
    width: 100%;
    aspect-ratio: 16 / 7;
    border-radius: 6px;
    background: var(--hg-bg-elevated, #17211c);
  }

  .cover.fallback {
    display: grid;
    place-items: center;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--hg-accent-primary, #5dd39e) 28%, var(--hg-bg-elevated, #17211c)),
      var(--hg-bg-elevated, #17211c)
    );
  }

  .cover-initial {
    color: var(--hg-text-primary, #eef8f1);
    font-size: 28px;
    font-weight: 700;
    opacity: 0.8;
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

  .pack-body p,
  .detail-view p,
  .profile-copy span {
    color: var(--hg-text-secondary, #b5c7bd);
    font-size: 12px;
    line-height: 1.35;
  }

  .counts {
    color: var(--hg-text-primary, #eef8f1) !important;
  }

  .pack-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .detail-title {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .detail-heading {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
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
    flex: none;
    width: 42px;
    height: 42px;
    padding: 0;
    border-radius: 50%;
    background: var(--hg-bg-elevated, #17211c);
    display: grid;
    place-items: center;
    font-weight: 700;
    border: 1px solid currentColor;
  }

  .avatar.small {
    width: 28px;
    height: 28px;
    border: 2px solid var(--hg-bg-surface, #101612);
    font-size: 11px;
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

  .profile-name,
  .profile-copy code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-name {
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    font-weight: 700;
  }

  .profile-name:hover {
    text-decoration: underline;
  }

  .profile-copy code {
    color: var(--hg-text-muted, #718078);
    font-size: 11px;
  }

  .empty {
    color: var(--hg-text-muted, #718078);
    padding: 16px;
    grid-column: 1 / -1;
  }

  @media (max-width: 760px) {
    .detail-heading {
      grid-template-columns: 1fr;
      align-items: start;
      justify-items: start;
    }
  }
</style>
