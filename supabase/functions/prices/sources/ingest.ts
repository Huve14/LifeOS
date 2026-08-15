// The ingestion runner.
//
// Every source is fetched independently: one dead retailer must never empty
// the Deals tab or fail the scheduled run. Each source reports its own outcome
// so lifeos_price_sources shows which feeds are actually alive.

import type { SourceDefinition } from './catalogue.ts';
import { type RawOffer, dedupeOffers } from './normalize.ts';
import { offerFromMetaTags, offersFromHtml } from './structured-data.ts';
import { type RobotsPolicy, isPathAllowed, parseRobots, pathOf } from './robots.ts';

export type SourceStatus = 'ok' | 'empty' | 'error' | 'skipped';

export type SourceResult = {
  slug: string;
  status: SourceStatus;
  offers: RawOffer[];
  error: string | null;
  pagesFetched: number;
  pagesBlocked: number;
};

export type FetchPage = (url: string, init: { signal: AbortSignal }) => Promise<
  { ok: boolean; status: number; body: string }
>;

export type IngestDeps = {
  fetchPage: FetchPage;
  /** Milliseconds before a single page fetch is abandoned. */
  timeoutMs?: number;
  /** Pause between requests to one host. */
  politenessMs?: number;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLITENESS_MS = 1_000;
const MAX_OFFERS_PER_SOURCE = 400;

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  deps: IngestDeps,
  url: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await deps.fetchPage(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRobots(deps: IngestDeps, origin: string): Promise<RobotsPolicy> {
  try {
    const response = await fetchWithTimeout(deps, `${origin}/robots.txt`);
    // A missing or server-errored robots.txt means no stated restriction.
    if (!response.ok) return { rules: [], crawlDelaySeconds: null };
    return parseRobots(response.body, deps.userAgent ?? '*');
  } catch {
    return { rules: [], crawlDelaySeconds: null };
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/**
 * Fetch and parse one source. Never throws: a failure is a result, because the
 * caller is a scheduled job that must keep going.
 */
export async function collectFromSource(
  definition: SourceDefinition,
  deps: IngestDeps,
): Promise<SourceResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const offers: RawOffer[] = [];
  const errors: string[] = [];
  const robotsByOrigin = new Map<string, RobotsPolicy>();
  let pagesFetched = 0;
  let pagesBlocked = 0;

  for (const url of definition.offerUrls) {
    const origin = originOf(url);
    if (!origin) {
      errors.push(`Invalid URL: ${url}`);
      continue;
    }

    try {
      if (!robotsByOrigin.has(origin)) {
        robotsByOrigin.set(origin, await loadRobots(deps, origin));
      }
      const policy = robotsByOrigin.get(origin)!;
      if (!isPathAllowed(policy, pathOf(url))) {
        pagesBlocked += 1;
        continue;
      }

      const wait = policy.crawlDelaySeconds !== null
        ? Math.max(policy.crawlDelaySeconds * 1000, deps.politenessMs ?? DEFAULT_POLITENESS_MS)
        : (deps.politenessMs ?? DEFAULT_POLITENESS_MS);
      if (pagesFetched > 0) await sleep(wait);

      const response = await fetchWithTimeout(deps, url);
      pagesFetched += 1;
      if (!response.ok) {
        errors.push(`${url} returned ${response.status}`);
        continue;
      }

      const context = {
        sourceSlug: definition.slug,
        storeName: definition.storeName,
        area: definition.area,
        emirate: definition.emirates.length === 1 ? definition.emirates[0] : null,
        pageUrl: url,
      };

      const found = offersFromHtml(response.body, context);
      if (found.length > 0) {
        offers.push(...found);
      } else {
        const single = offerFromMetaTags(response.body, context);
        if (single) offers.push(single);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Failed to read ${url}`);
    }
  }

  const deduped = dedupeOffers(offers).slice(0, MAX_OFFERS_PER_SOURCE);

  // Every page blocked by robots.txt is a deliberate skip, not a failure.
  if (deduped.length === 0 && pagesFetched === 0 && pagesBlocked > 0) {
    return { slug: definition.slug, status: 'skipped', offers: [], error: null, pagesFetched, pagesBlocked };
  }
  if (deduped.length > 0) {
    return { slug: definition.slug, status: 'ok', offers: deduped, error: null, pagesFetched, pagesBlocked };
  }
  if (errors.length > 0) {
    return {
      slug: definition.slug,
      status: 'error',
      offers: [],
      error: errors.join('; ').slice(0, 500),
      pagesFetched,
      pagesBlocked,
    };
  }
  // Reachable but publishing nothing we can read -- the signal that this source
  // needs bespoke parsing rather than the shared structured-data reader.
  return { slug: definition.slug, status: 'empty', offers: [], error: null, pagesFetched, pagesBlocked };
}

/**
 * Run several sources with bounded concurrency. Uses allSettled semantics
 * throughout so a thrown adapter cannot abort the batch.
 */
export async function collectFromSources(
  definitions: SourceDefinition[],
  deps: IngestDeps,
  concurrency = 4,
): Promise<SourceResult[]> {
  const queue = [...definitions];
  const results: SourceResult[] = [];

  async function worker(): Promise<void> {
    for (;;) {
      const definition = queue.shift();
      if (!definition) return;
      try {
        results.push(await collectFromSource(definition, deps));
      } catch (error) {
        results.push({
          slug: definition.slug,
          status: 'error',
          offers: [],
          error: error instanceof Error ? error.message : 'Source failed',
          pagesFetched: 0,
          pagesBlocked: 0,
        });
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, definitions.length)) }, worker);
  await Promise.all(workers);
  return results;
}
