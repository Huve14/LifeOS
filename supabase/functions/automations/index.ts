// Daily Life OS automations. This function only writes to the existing
// lifeos_notifications queue; the notify Edge Function remains the single
// APNs delivery path.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ABU_DHABI_LATITUDE = 24.4539;
const ABU_DHABI_LONGITUDE = 54.3773;
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v2/rate/AED/ZAR';

type Json = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

function object(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function relatedObject(value: unknown): Json {
  return object(Array.isArray(value) ? value[0] : value);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function dubaiDate(value = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

function weatherLabel(code: number): string {
  if (code === 0) return 'Clear sky';
  if ([1, 2].includes(code)) return 'Mostly clear';
  if (code === 3) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Misty';
  if (code >= 51 && code <= 67) return 'Light rain possible';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 95) return 'Thunderstorms possible';
  return 'Abu Dhabi weather';
}

async function externalSnapshot(): Promise<{ weather: Json; prayer: Json; fx: Json }> {
  const today = dubaiDate().split('-').reverse().join('-');
  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
  weatherUrl.searchParams.set('latitude', String(ABU_DHABI_LATITUDE));
  weatherUrl.searchParams.set('longitude', String(ABU_DHABI_LONGITUDE));
  weatherUrl.searchParams.set('current', 'temperature_2m,weather_code');
  weatherUrl.searchParams.set('timezone', 'Asia/Dubai');
  const prayerUrl = `https://api.aladhan.com/v1/timingsByCity/${today}?city=Abu%20Dhabi&country=United%20Arab%20Emirates&method=8`;
  const [weatherResult, prayerResult, fxResult] = await Promise.allSettled([
    fetch(weatherUrl).then(response => response.ok ? response.json() : Promise.reject(new Error('Weather unavailable'))),
    fetch(prayerUrl).then(response => response.ok ? response.json() : Promise.reject(new Error('Prayer times unavailable'))),
    fetch(FRANKFURTER_URL).then(response => response.ok ? response.json() : Promise.reject(new Error('FX unavailable'))),
  ]);
  const weatherPayload = weatherResult.status === 'fulfilled' ? object(weatherResult.value) : {};
  const current = object(weatherPayload.current);
  const prayerPayload = prayerResult.status === 'fulfilled' ? object(prayerResult.value) : {};
  const timings = object(object(prayerPayload.data).timings);
  const fxPayload = fxResult.status === 'fulfilled' ? object(fxResult.value) : {};
  const code = Number(current.weather_code);
  return {
    weather: {
      temperatureC: Number.isFinite(Number(current.temperature_2m)) ? Number(current.temperature_2m) : null,
      code: Number.isFinite(code) ? code : null,
      label: Number.isFinite(code) ? weatherLabel(code) : 'Weather unavailable',
    },
    prayer: {
      fajr: text(timings.Fajr), dhuhr: text(timings.Dhuhr), asr: text(timings.Asr),
      maghrib: text(timings.Maghrib), isha: text(timings.Isha),
    },
    fx: {
      rate: Number.isFinite(Number(fxPayload.rate)) ? Number(fxPayload.rate) : null,
      date: text(fxPayload.date), base: 'AED', quote: 'ZAR',
    },
  };
}

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function authenticatedUser(request: Request): Promise<string | null> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await serviceClient().auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}

async function enqueueOnce(
  client: SupabaseClient,
  recipientId: string,
  automationKey: string,
  periodKey: string,
  title: string,
  body: string,
  data: Json,
): Promise<boolean> {
  const delivery = await client.from('lifeos_automation_deliveries').insert({
    recipient_id: recipientId, automation_key: automationKey, period_key: periodKey,
  }).select('id').maybeSingle();
  if (delivery.error) {
    if (delivery.error.code === '23505') return false;
    throw delivery.error;
  }
  const queued = await client.from('lifeos_notifications').insert({
    recipient_id: recipientId, title, body, data,
  });
  if (queued.error) throw queued.error;
  return true;
}

async function buildBrief(client: SupabaseClient, userId: string): Promise<Json> {
  const date = dubaiDate();
  const dayStart = `${date}T00:00:00+04:00`;
  const nextDay = new Date(`${dayStart}`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const [external, deadlines, rsvps, saCalendar] = await Promise.all([
    externalSnapshot(),
    client.from('lifeos_arrival_tasks').select('id, title, detail, due_on, status')
      .eq('owner_id', userId).eq('status', 'pending').order('due_on').limit(5),
    client.from('lifeos_event_rsvps').select('event_id, response, event:lifeos_community_events(id, title, starts_at, location)')
      .eq('user_id', userId).eq('response', 'going'),
    client.from('lifeos_sa_calendar').select('slug, title, starts_at, category, venue, source_name, source_url')
      .gte('starts_at', dayStart).lt('starts_at', nextDay.toISOString()).order('starts_at'),
  ]);
  const communityEvents = (rsvps.data ?? []).map(row => relatedObject(row.event)).filter(event => {
    const start = Date.parse(text(event.starts_at));
    return Number.isFinite(start) && start >= Date.parse(dayStart) && start < nextDay.getTime();
  });
  const payload = {
    date,
    generatedAt: new Date().toISOString(),
    ...external,
    events: [...communityEvents, ...(saCalendar.data ?? [])],
    nextDeadline: deadlines.data?.[0] ?? null,
    deadlines: deadlines.data ?? [],
    stale: false,
  };
  const cached = await client.from('lifeos_daily_briefs').upsert({
    user_id: userId, brief_date: date, payload, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,brief_date' });
  if (cached.error) console.error('daily brief cache failed', cached.error);
  return payload;
}

async function runPriceWatches(client: SupabaseClient): Promise<number> {
  const watches = await client.from('lifeos_price_watches')
    .select('id, owner_id, product_id, target_price, last_notified_at, product:lifeos_products(name)')
    .eq('active', true);
  if (watches.error) throw watches.error;
  let sent = 0;
  for (const watch of watches.data ?? []) {
    const preference = await client.from('lifeos_automation_preferences')
      .select('price_watch_alerts').eq('user_id', watch.owner_id).maybeSingle();
    if (preference.data?.price_watch_alerts === false) continue;
    const latest = await client.from('lifeos_price_points')
      .select('id, price, seen_at, store:lifeos_stores(name)')
      .eq('product_id', watch.product_id).order('seen_at', { ascending: false }).limit(1).maybeSingle();
    if (!latest.data || Number(latest.data.price) > Number(watch.target_price)) continue;
    if (watch.last_notified_at && Date.parse(latest.data.seen_at) <= Date.parse(watch.last_notified_at)) continue;
    const product = relatedObject(watch.product);
    const store = relatedObject(latest.data.store);
    const queued = await enqueueOnce(
      client, watch.owner_id, `price_watch:${watch.id}`, latest.data.id,
      `${text(product.name, 'Your watched item')} reached your price`,
      `AED ${Number(latest.data.price).toFixed(2)} at ${text(store.name, 'a listed store')}.`,
      { screen: 'shopping', watchId: watch.id, productId: watch.product_id },
    );
    if (queued) {
      sent += 1;
      await client.from('lifeos_price_watches').update({ last_notified_at: new Date().toISOString() }).eq('id', watch.id);
    }
  }
  return sent;
}

async function runFxAlerts(client: SupabaseClient, rate: number | null): Promise<number> {
  if (!Number.isFinite(rate)) return 0;
  const preferences = await client.from('lifeos_automation_preferences')
    .select('user_id, fx_target, fx_direction').eq('fx_alerts', true).not('fx_target', 'is', null);
  if (preferences.error) throw preferences.error;
  let sent = 0;
  for (const preference of preferences.data ?? []) {
    const target = Number(preference.fx_target);
    const crossed = preference.fx_direction === 'below' ? Number(rate) <= target : Number(rate) >= target;
    if (!crossed) continue;
    if (await enqueueOnce(
      client, preference.user_id, 'fx_target', dubaiDate(),
      'Your AED → ZAR target is here',
      `1 AED is about R ${Number(rate).toFixed(2)} today.`,
      { screen: 'shopping', rate },
    )) {
      sent += 1;
      await client.from('lifeos_automation_preferences')
        .update({ last_fx_notified_at: new Date().toISOString() }).eq('user_id', preference.user_id);
    }
  }
  return sent;
}

async function runEventReminders(client: SupabaseClient): Promise<number> {
  const now = Date.now();
  const events = await client.from('lifeos_community_events')
    .select('id, title, starts_at, location').gt('starts_at', new Date(now + 60 * 60 * 1000).toISOString())
    .lt('starts_at', new Date(now + 25 * 60 * 60 * 1000).toISOString());
  if (events.error) throw events.error;
  let sent = 0;
  for (const event of events.data ?? []) {
    const hours = (Date.parse(event.starts_at) - now) / 3_600_000;
    const bucket = hours <= 3 ? '2h' : hours >= 23 ? '24h' : null;
    if (!bucket) continue;
    const rsvps = await client.from('lifeos_event_rsvps').select('user_id').eq('event_id', event.id).eq('response', 'going');
    for (const rsvp of rsvps.data ?? []) {
      const preference = await client.from('lifeos_automation_preferences')
        .select('event_reminders').eq('user_id', rsvp.user_id).maybeSingle();
      if (preference.data?.event_reminders === false) continue;
      if (await enqueueOnce(
        client, rsvp.user_id, `event:${event.id}`, bucket,
        bucket === '2h' ? 'Starting in about 2 hours' : 'Tomorrow in Abu Dhabi',
        `${event.title}${event.location ? ` · ${event.location}` : ''}`,
        { screen: 'community', eventId: event.id },
      )) sent += 1;
    }
  }
  return sent;
}

async function runWeeklyDigest(client: SupabaseClient): Promise<number> {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dubai', weekday: 'short' }).format(new Date());
  if (weekday !== 'Sun') return 0;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const deals = await client.from('lifeos_deals').select('id', { count: 'exact', head: true }).gte('created_at', since);
  const saBasket = await client.from('lifeos_price_points')
    .select('id, product:lifeos_products!inner(is_sa_favourite)', { count: 'exact', head: true })
    .eq('product.is_sa_favourite', true).gte('seen_at', since);
  const preferences = await client.from('lifeos_automation_preferences').select('user_id').eq('weekly_deals_digest', true);
  let sent = 0;
  for (const preference of preferences.data ?? []) {
    const watchDrops = await client.from('lifeos_price_watches').select('id', { count: 'exact', head: true })
      .eq('owner_id', preference.user_id).gte('last_notified_at', since);
    const count = deals.count ?? 0;
    const drops = watchDrops.count ?? 0;
    const saStock = saBasket.count ?? 0;
    if (count === 0 && drops === 0 && saStock === 0) continue;
    const week = dubaiDate().slice(0, 7) + `-${Math.ceil(Number(dubaiDate().slice(8, 10)) / 7)}`;
    if (await enqueueOnce(
      client, preference.user_id, 'weekly_deals', week,
      'Your Sunday Shop & Save digest',
      `${count} new deal${count === 1 ? '' : 's'} · ${drops} watched price drop${drops === 1 ? '' : 's'} · ${saStock} fresh SA-basket price${saStock === 1 ? '' : 's'}.`,
      { screen: 'shopping' },
    )) {
      sent += 1;
      await client.from('lifeos_automation_preferences')
        .update({ last_digest_at: new Date().toISOString() }).eq('user_id', preference.user_id);
    }
  }
  return sent;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body: Json = {};
  try { body = object(await request.json()); } catch { /* empty body is allowed */ }
  const action = text(body.action, 'brief');
  const client = serviceClient();

  try {
    if (action === 'brief') {
      const userId = await authenticatedUser(request);
      if (!userId) return json({ error: 'Unauthorized' }, 401);
      return json(await buildBrief(client, userId));
    }

    if (action !== 'run') return json({ error: 'Unknown action' }, 400);
    const cronSecret = Deno.env.get('AUTOMATIONS_CRON_SECRET');
    if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const external = await externalSnapshot();
    const rate = Number.isFinite(Number(external.fx.rate)) ? Number(external.fx.rate) : null;
    const [priceWatches, fxAlerts, eventReminders, weeklyDigests] = await Promise.all([
      runPriceWatches(client), runFxAlerts(client, rate), runEventReminders(client), runWeeklyDigest(client),
    ]);
    return json({ ok: true, priceWatches, fxAlerts, eventReminders, weeklyDigests, ranAt: new Date().toISOString() });
  } catch (error) {
    console.error('automation function failed', error);
    return json({ error: error instanceof Error ? error.message : 'Automation failed' }, 500);
  }
});
