import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatRentCheckCard,
  gracefulRentCheckCard,
  normalizeRentCheckInput,
  searchFilters,
} from '../lib/rent-check.mjs';
import { canUseCachedListings } from '../api/search.mjs';

const listings = [
  { address: 'A', price: 2200, beds: 2, baths: 2, sqft: 1100, daysListed: '3 days' },
  { address: 'B', price: 2500, beds: 3, baths: 2, sqft: 1300, daysListed: 'New' },
  { address: 'C', price: 1800, beds: 1, baths: 1, sqft: 900, daysListed: '8 days' },
];

test('parses natural-language rent check asks', () => {
  const subject = normalizeRentCheckInput({ ask: 'What should I charge for a 2bd/2ba 1,100sqft in 85281?' });
  assert.equal(subject.ok, true);
  assert.equal(subject.location, '85281');
  assert.equal(subject.beds, 2);
  assert.equal(subject.baths, 2);
  assert.equal(subject.sqft, 1100);
});

test('builds bounded search filters from subject specs', () => {
  assert.deepEqual(searchFilters({ location: '85281', beds: 2, baths: 2, sqft: 1100 }), {
    location: '85281',
    minBeds: 1,
    maxBeds: 3,
    minBaths: 1,
    maxBaths: 3,
    minSqft: 825,
    maxSqft: 1375,
  });
});

test('formats top comps and a rent range', () => {
  const card = formatRentCheckCard({ location: '85281', beds: 2, baths: 2, sqft: 1100 }, listings);
  assert.equal(card.ok, true);
  assert.equal(card.type, 'rent_check');
  assert.equal(card.comps.length, 3);
  assert.deepEqual(card.suggestedRange, { low: 2060, high: 2280, basis: 'avg_price_per_sqft' });
  assert.match(card.verdict, /Comps support/);
});

test('fills missing specs from market medians', () => {
  const card = formatRentCheckCard({ location: '85281' }, listings);
  assert.deepEqual(card.subject.defaultsUsed, ['beds', 'baths', 'sqft']);
  assert.equal(card.subject.beds, 2);
  assert.equal(card.subject.baths, 2);
  assert.equal(card.subject.sqft, 1100);
});

test('thin markets return a graceful card', () => {
  const card = formatRentCheckCard({ location: 'Nowhere', beds: 2 }, []);
  assert.equal(card.ok, true);
  assert.equal(card.comps.length, 0);
  assert.match(card.verdict, /Thin market/);
  assert.equal(gracefulRentCheckCard('Missing location').ok, true);
});

test('cached listings are only used for the Phoenix cache market', () => {
  assert.equal(canUseCachedListings('Moon Valley 85023'), true);
  assert.equal(canUseCachedListings('Austin, TX'), false);
});
