// Minimal robots.txt support.
//
// Ingestion reads pages retailers publish for shoppers, so it should honour the
// same rules a crawler would. This implements the parts of the de-facto
// standard that matter here: User-agent grouping, Allow/Disallow, the
// longest-match-wins rule, and wildcard/end-anchor patterns.

export type RobotsRule = { allow: boolean; pattern: string };
export type RobotsPolicy = { rules: RobotsRule[]; crawlDelaySeconds: number | null };

/** Parse robots.txt into the rules that apply to `userAgent`. */
export function parseRobots(body: string, userAgent = '*'): RobotsPolicy {
  const wanted = userAgent.toLowerCase();
  const groups = new Map<string, RobotsRule[]>();
  const delays = new Map<string, number>();

  let currentAgents: string[] = [];
  let lastLineWasAgent = false;

  for (const rawLine of String(body ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      // Consecutive User-agent lines share one group of rules.
      if (!lastLineWasAgent) currentAgents = [];
      currentAgents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (currentAgents.length === 0) continue;

    if (field === 'disallow' || field === 'allow') {
      for (const agent of currentAgents) {
        const rules = groups.get(agent) ?? [];
        // An empty Disallow means "allow everything" and carries no pattern.
        if (field === 'disallow' && value === '') {
          rules.push({ allow: true, pattern: '/' });
        } else if (value !== '') {
          rules.push({ allow: field === 'allow', pattern: value });
        }
        groups.set(agent, rules);
      }
    } else if (field === 'crawl-delay') {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        for (const agent of currentAgents) delays.set(agent, seconds);
      }
    }
  }

  // Most specific group wins: our agent, else the wildcard group.
  const matched = [...groups.keys()].find(agent => wanted.includes(agent) && agent !== '*');
  const key = matched ?? '*';
  return { rules: groups.get(key) ?? [], crawlDelaySeconds: delays.get(key) ?? null };
}

function patternToRegExp(pattern: string): RegExp {
  let source = '';
  for (const character of pattern) {
    if (character === '*') source += '.*';
    else if (character === '$') source += '$';
    else source += character.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}`);
}

/**
 * Decide whether a path may be fetched. Longest matching pattern wins; Allow
 * beats Disallow on an equal-length tie, per the common interpretation.
 */
export function isPathAllowed(policy: RobotsPolicy, path: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of policy.rules) {
    if (!patternToRegExp(rule.pattern).test(path)) continue;
    if (
      best === null
      || rule.pattern.length > best.pattern.length
      || (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best === null ? true : best.allow;
}

export function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return '/';
  }
}
