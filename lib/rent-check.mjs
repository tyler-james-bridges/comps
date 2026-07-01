export function normalizeRentCheckInput(body = {}) {
  const parsed = typeof body.ask === 'string' ? parseAsk(body.ask) : {};
  const location = stringValue(body.location) || parsed.location;
  return {
    ok: Boolean(location),
    location,
    beds: numberValue(body.beds ?? body.myBeds) ?? parsed.beds,
    baths: numberValue(body.baths ?? body.myBaths) ?? parsed.baths,
    sqft: numberValue(body.sqft ?? body.mySqft) ?? parsed.sqft,
    message: location ? undefined : 'Location is required. Try a ZIP, neighborhood, or city.',
  };
}

export function searchFilters(subject) {
  return {
    location: subject.location,
    minBeds: subject.beds ? Math.max(0, subject.beds - 1) : undefined,
    maxBeds: subject.beds ? subject.beds + 1 : undefined,
    minBaths: subject.baths ? Math.max(0, subject.baths - 1) : undefined,
    maxBaths: subject.baths ? subject.baths + 1 : undefined,
    minSqft: subject.sqft ? Math.round(subject.sqft * 0.75) : undefined,
    maxSqft: subject.sqft ? Math.round(subject.sqft * 1.25) : undefined,
  };
}

export function formatRentCheckCard(subjectInput, listings = []) {
  const normalized = applyMedianDefaults(subjectInput, listings);
  const scored = listings.map((listing) => scoreListing(listing, normalized.subject))
    .sort((a, b) => b.compScore - a.compScore);
  const range = suggestedRange(scored, normalized.subject.sqft);
  const comps = scored.slice(0, 5).map((listing) => ({
    address: listing.address || 'Address unavailable',
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    rent: priceNumber(listing.price),
    pricePerSqft: listing.pricePerSqft,
    daysOnMarket: listing.daysListed || listing.daysOnMarket || 'Unknown',
    compScore: listing.compScore,
    url: listing.url,
  }));
  const verdict = verdictLine(range, comps.length);
  return {
    ok: true,
    type: 'rent_check',
    subject: normalized.subject,
    suggestedRange: range,
    comps,
    verdict,
    summary: comps.length ? `${comps.length} rental comps found near ${normalized.subject.location}.` : `No rental comps found near ${normalized.subject.location}.`,
  };
}

export function gracefulRentCheckCard(message, subject = {}) {
  return {
    ok: true,
    type: 'rent_check',
    subject,
    suggestedRange: null,
    comps: [],
    verdict: message,
    summary: message,
  };
}

function parseAsk(ask) {
  const location = ask.match(/\b(?:in|near|around)\s+([a-z0-9 ,.-]+?)(?:\s+\d+\s*(?:bd|bed|ba|bath|sqft)|[?.!]|$)/i)?.[1]?.trim()
    || ask.match(/\b\d{5}\b/)?.[0];
  return {
    location,
    beds: numberMatch(ask, /(\d+(?:\.\d+)?)\s*(?:bd|bed|beds|bedroom|bedrooms)\b/i),
    baths: numberMatch(ask, /(\d+(?:\.\d+)?)\s*(?:ba|bath|baths|bathroom|bathrooms)\b/i),
    sqft: numberMatch(ask, /([\d,]+)\s*(?:sqft|sq ft|sf)\b/i),
  };
}

function applyMedianDefaults(subject, listings) {
  const defaultsUsed = [];
  const withBeds = listings.map((l) => numberValue(l.beds)).filter(Boolean).sort((a, b) => a - b);
  const withBaths = listings.map((l) => numberValue(l.baths)).filter(Boolean).sort((a, b) => a - b);
  const withSqft = listings.map((l) => numberValue(l.sqft)).filter(Boolean).sort((a, b) => a - b);
  const filled = { ...subject };
  if (!filled.beds && withBeds.length) { filled.beds = median(withBeds); defaultsUsed.push('beds'); }
  if (!filled.baths && withBaths.length) { filled.baths = median(withBaths); defaultsUsed.push('baths'); }
  if (!filled.sqft && withSqft.length) { filled.sqft = median(withSqft); defaultsUsed.push('sqft'); }
  return { subject: { ...filled, defaultsUsed } };
}

function scoreListing(listing, subject) {
  let score = 100;
  if (subject.beds && listing.beds) score -= Math.abs(listing.beds - subject.beds) * 15;
  if (subject.baths && listing.baths) score -= Math.abs(listing.baths - subject.baths) * 10;
  if (subject.sqft && listing.sqft) score -= Math.floor(Math.abs(listing.sqft - subject.sqft) / 100) * 5;
  const rent = priceNumber(listing.price);
  return {
    ...listing,
    price: rent,
    pricePerSqft: rent && listing.sqft ? Number((rent / listing.sqft).toFixed(2)) : null,
    compScore: Math.max(0, Math.min(100, Math.round(score))),
  };
}

function suggestedRange(listings, sqft) {
  const ppsf = listings.map((l) => l.pricePerSqft).filter((n) => Number.isFinite(n) && n > 0);
  if (ppsf.length && sqft) {
    const avg = ppsf.reduce((sum, n) => sum + n, 0) / ppsf.length;
    return { low: roundTen(sqft * avg * 0.95), high: roundTen(sqft * avg * 1.05), basis: 'avg_price_per_sqft' };
  }
  const rents = listings.map((l) => priceNumber(l.price)).filter(Boolean).sort((a, b) => a - b);
  if (!rents.length) return null;
  const mid = median(rents);
  return { low: roundTen(mid * 0.95), high: roundTen(mid * 1.05), basis: 'median_rent' };
}

function verdictLine(range, count) {
  if (!count) return 'Thin market: no active rental comps came back. Try a nearby ZIP or wider spec range.';
  if (!range) return 'Thin market: comps came back, but not enough price data for a rent range.';
  return `Comps support about $${range.low.toLocaleString()}-$${range.high.toLocaleString()}/mo.`;
}

function priceNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  const match = value.replace(/,/g, '').match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function numberValue(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function numberMatch(value, regex) {
  const match = value.match(regex);
  return match ? numberValue(match[1]) : undefined;
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function median(values) {
  return values[Math.floor(values.length / 2)];
}

function roundTen(value) {
  return Math.round(value / 10) * 10;
}
