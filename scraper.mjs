#!/usr/bin/env node
// Moon Valley Rental Comp Scraper
// Scrapes Zillow for competing rental listings near Tyler's property
// Property: 5bd/3ba, 2400sqft, 10K lot, 2-story, 2-car garage, Moon Valley AZ (85022/85023)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tyler's property profile
const MY_PROPERTY = {
  beds: 5,
  baths: 3,
  sqft: 2400,
  lotSqft: 10000,
  stories: 2,
  garage: 2,
  yearBuilt: 1984,
  zip: '85022',
  area: 'Moon Valley',
  features: ['fresh flooring', 'fresh paint'],
};

// Search config - what counts as a comp
const SEARCH = {
  minBeds: 3,
  maxBeds: 6,
  minBaths: 2,
  maxBaths: 4,
  minSqft: 1500,
  maxSqft: 3200,
  zips: ['85022', '85023', '85020', '85024', '85028', '85032'],
  // Zillow search URLs for Moon Valley + nearby
  urls: [
    // Moon Valley Canyon - houses for rent, 4+ beds, 2+ baths
    'https://www.zillow.com/moon-valley-canyon-phoenix-az/rentals/?searchQueryState=%7B%22isMapVisible%22%3Atrue%2C%22filterState%22%3A%7B%22beds%22%3A%7B%22min%22%3A3%7D%2C%22baths%22%3A%7B%22min%22%3A2%7D%2C%22fr%22%3A%7B%22value%22%3Atrue%7D%2C%22fsba%22%3A%7B%22value%22%3Afalse%7D%2C%22fsbo%22%3A%7B%22value%22%3Afalse%7D%2C%22nc%22%3A%7B%22value%22%3Afalse%7D%2C%22cmsn%22%3A%7B%22value%22%3Afalse%7D%2C%22auc%22%3A%7B%22value%22%3Afalse%7D%2C%22fore%22%3A%7B%22value%22%3Afalse%7D%2C%22tow%22%3A%7B%22value%22%3Afalse%7D%2C%22mf%22%3A%7B%22value%22%3Afalse%7D%2C%22con%22%3A%7B%22value%22%3Afalse%7D%2C%22land%22%3A%7B%22value%22%3Afalse%7D%2C%22apa%22%3A%7B%22value%22%3Afalse%7D%2C%22manu%22%3A%7B%22value%22%3Afalse%7D%7D%7D',
    // 85022 zip - broader area
    'https://www.zillow.com/phoenix-az-85022/rentals/?searchQueryState=%7B%22isMapVisible%22%3Atrue%2C%22filterState%22%3A%7B%22beds%22%3A%7B%22min%22%3A3%7D%2C%22baths%22%3A%7B%22min%22%3A2%7D%2C%22fr%22%3A%7B%22value%22%3Atrue%7D%2C%22fsba%22%3A%7B%22value%22%3Afalse%7D%2C%22fsbo%22%3A%7B%22value%22%3Afalse%7D%2C%22nc%22%3A%7B%22value%22%3Afalse%7D%2C%22cmsn%22%3A%7B%22value%22%3Afalse%7D%2C%22auc%22%3A%7B%22value%22%3Afalse%7D%2C%22fore%22%3A%7B%22value%22%3Afalse%7D%2C%22tow%22%3A%7B%22value%22%3Afalse%7D%2C%22mf%22%3A%7B%22value%22%3Afalse%7D%2C%22con%22%3A%7B%22value%22%3Afalse%7D%2C%22land%22%3A%7B%22value%22%3Afalse%7D%2C%22apa%22%3A%7B%22value%22%3Afalse%7D%2C%22manu%22%3A%7B%22value%22%3Afalse%7D%7D%7D',
  ],
};

// Compute a comp score (0-100) based on similarity to Tyler's property
function compScore(listing) {
  let score = 100;

  // Bed difference (most important)
  const bedDiff = Math.abs(listing.beds - MY_PROPERTY.beds);
  score -= bedDiff * 15;

  // Bath difference
  const bathDiff = Math.abs(listing.baths - MY_PROPERTY.baths);
  score -= bathDiff * 10;

  // Sqft difference (per 100 sqft off)
  if (listing.sqft) {
    const sqftDiff = Math.abs(listing.sqft - MY_PROPERTY.sqft);
    score -= Math.floor(sqftDiff / 100) * 5;
  } else {
    score -= 10; // penalty for unknown sqft
  }

  // Same zip bonus
  if (listing.zip === MY_PROPERTY.zip) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

// Format currency
function fmt(n) {
  return '$' + n.toLocaleString();
}

// Format price per sqft
function ppsf(price, sqft) {
  if (!sqft) return 'N/A';
  return '$' + (price / sqft).toFixed(2);
}

// Main scrape function - parses already-fetched data
function parseListings(data) {
  // Data comes from Zillow page scrape
  return data.map(d => ({
    ...d,
    compScore: compScore(d),
    pricePerSqft: d.sqft ? (d.price / d.sqft).toFixed(2) : null,
  }));
}

// Generate report
function generateReport(listings) {
  const sorted = listings.sort((a, b) => b.compScore - a.compScore);
  const prices = sorted.map(l => l.price);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const median = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  // Price per sqft for those that have it
  const withSqft = sorted.filter(l => l.sqft);
  const avgPpsf = withSqft.length
    ? withSqft.reduce((a, l) => a + l.price / l.sqft, 0) / withSqft.length
    : 0;

  let report = `\n🏠 MOON VALLEY RENTAL COMP REPORT\n`;
  report += `${'='.repeat(50)}\n`;
  report += `Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' })}\n`;
  report += `Your Property: ${MY_PROPERTY.beds}bd/${MY_PROPERTY.baths}ba, ${MY_PROPERTY.sqft.toLocaleString()} sqft\n\n`;

  report += `📊 MARKET SUMMARY (${sorted.length} comps found)\n`;
  report += `${'-'.repeat(40)}\n`;
  report += `  Average Rent:    ${fmt(Math.round(avg))}/mo\n`;
  report += `  Median Rent:     ${fmt(median)}/mo\n`;
  report += `  Range:           ${fmt(min)} - ${fmt(max)}/mo\n`;
  if (avgPpsf) {
    report += `  Avg $/sqft:      $${avgPpsf.toFixed(2)}/sqft\n`;
    report += `  Suggested Range: ${fmt(Math.round(MY_PROPERTY.sqft * avgPpsf * 0.95))} - ${fmt(Math.round(MY_PROPERTY.sqft * avgPpsf * 1.05))}/mo\n`;
  }

  report += `\n📋 LISTINGS BY COMP SCORE\n`;
  report += `${'-'.repeat(40)}\n`;

  for (const l of sorted) {
    report += `\n  ${l.address}\n`;
    report += `  ${fmt(l.price)}/mo | ${l.beds}bd/${l.baths}ba | ${l.sqft ? l.sqft.toLocaleString() + ' sqft' : 'sqft N/A'}`;
    if (l.pricePerSqft) report += ` | $${l.pricePerSqft}/sqft`;
    report += `\n`;
    report += `  Comp Score: ${l.compScore}/100 | ${l.zip} | ${l.daysListed || 'New'}\n`;
    report += `  ${l.url}\n`;
  }

  return report;
}

// Export for use
export { MY_PROPERTY, SEARCH, compScore, parseListings, generateReport };

// If run directly, load saved data and generate report
const dataFile = path.join(__dirname, 'listings.json');
if (fs.existsSync(dataFile)) {
  const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const listings = parseListings(raw);
  console.log(generateReport(listings));

  // Save report
  const reportFile = path.join(__dirname, 'report.txt');
  fs.writeFileSync(reportFile, generateReport(listings));
  console.log(`\nReport saved to ${reportFile}`);
} else {
  console.log('No listings.json found. Run the browser scrape first.');
}
