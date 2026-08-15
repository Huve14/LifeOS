import { describe, expect, it } from 'vitest';
import { buildCommunityFeed, pollPercentage, type CommunitySnapshot } from './community';

const empty: CommunitySnapshot = { memberCount: 0, me: null, profiles: [], events: [], questions: [], classifieds: [], polls: [], places: [] };

describe('Community helpers', () => {
  it('calculates stable poll results including an empty poll', () => {
    expect(pollPercentage(3, 4)).toBe(75);
    expect(pollPercentage(0, 0)).toBe(0);
  });

  it('builds one newest-first feed across community sections', () => {
    const feed = buildCommunityFeed({
      ...empty,
      questions: [{
        id: 'q1', authorId: 'a', title: 'Where can I find rooibos?', body: '', resolvedAnswerId: null,
        hidden: false, createdAt: '2026-08-14T09:00:00Z', answers: [],
      }],
      classifieds: [{
        id: 'c1', authorId: 'b', title: 'Dining table', description: '', category: 'Furniture', price: 250,
        currency: 'AED', area: 'Khalifa City', photoPath: null, photoUrl: null, soldAt: null,
        hidden: false, createdAt: '2026-08-15T09:00:00Z',
      }],
    });

    expect(feed.map((item) => item.kind)).toEqual(['classified', 'question']);
    expect(feed[0].detail).toContain('AED 250');
  });
});
