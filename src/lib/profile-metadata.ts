import { outbox, relay, type Subscription } from '@napplet/sdk';
import type { NostrEvent } from '@hyprgate/types';
import { KIND_METADATA } from '@hyprgate/types';

interface NappletShellHandle {
  ready(): Promise<unknown>;
  supports(domain: string, protocol?: string): boolean;
}

function getShell(): NappletShellHandle | null {
  return (globalThis as unknown as { napplet?: { shell?: NappletShellHandle } }).napplet?.shell ?? null;
}

export interface ProfileContent {
  name?: string;
  display_name?: string;
  picture?: string;
  nip05?: string;
}

export type ProfileMetadataCallback = (pubkey: string, profile: ProfileContent) => void;

const NOOP_SUBSCRIPTION: Subscription = { close: () => { /* no-op */ } };

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseProfileEvent(event: NostrEvent): ProfileContent | null {
  if (event.kind !== KIND_METADATA) return null;

  try {
    const metadata = JSON.parse(event.content) as Record<string, unknown>;
    return {
      name: optionalString(metadata.name),
      display_name: optionalString(metadata.display_name),
      picture: optionalString(metadata.picture),
      nip05: optionalString(metadata.nip05),
    };
  } catch {
    return null;
  }
}

export function subscribeProfileMetadata(
  pubkeys: string[],
  onProfile: ProfileMetadataCallback,
  onDone: () => void = () => { /* no-op */ },
): Subscription {
  const authors = [...new Set(pubkeys.filter((pubkey) => pubkey.length > 0))];
  if (authors.length === 0) {
    onDone();
    return NOOP_SUBSCRIPTION;
  }

  const latestByPubkey = new Map<string, number>();
  let subscription: Subscription | null = null;
  let closed = false;
  let closeWhenReady = false;

  function close(): void {
    if (closed) return;
    closed = true;
    if (subscription) {
      subscription.close();
    } else {
      closeWhenReady = true;
    }
  }

  function handleEvent(event: NostrEvent): void {
    if (closed || event.kind !== KIND_METADATA || !authors.includes(event.pubkey)) return;
    const latestCreatedAt = latestByPubkey.get(event.pubkey);
    if (latestCreatedAt !== undefined && latestCreatedAt > event.created_at) return;

    const profile = parseProfileEvent(event);
    if (!profile) return;

    latestByPubkey.set(event.pubkey, event.created_at);
    onProfile(event.pubkey, profile);
  }

  const filters = authors.map((author) => ({ kinds: [KIND_METADATA], authors: [author], limit: 1 }));

  void (async () => {
    const shell = getShell();
    await shell?.ready();
    if (closed) return;
    if (shell?.supports('outbox') ?? false) {
      const sub = outbox.subscribe(filters, { strategy: 'outbox', live: true });
      sub.on('event', (event) => handleEvent(event as NostrEvent));
      sub.on('eose', onDone);
      subscription = { close: () => sub.close() };
    } else {
      subscription = relay.subscribe(filters, (event) => handleEvent(event as NostrEvent), onDone);
    }
    if (closeWhenReady) subscription.close();
  })();

  return { close };
}
