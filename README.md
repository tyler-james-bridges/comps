# Comps — Rental Intelligence

Find and score competing rental listings against your property. Built for landlords who want to know exactly what they're up against.

## What It Does

- Search any location (ZIP, neighborhood, city) for active rental listings
- Score every listing against your property specs (beds, baths, sqft, location)
- See property images, value-add features, and days on market
- Get a suggested rent range based on market avg $/sqft
- Light/dark mode, fully responsive

## The Differentiator

Unlike Zillow or Redfin, Comps is built around **your property**. Every listing gets a comp score showing how similar it is to yours. Value-driving features (pool, garage, updated finishes) are highlighted so you can see *why* a comp is priced higher or lower.

## Quick Start

```bash
npm install
npm start
```

Open [http://localhost:3456](http://localhost:3456)

## How It Works

- **Frontend**: Vanilla HTML/CSS/JS — no frameworks, no build step
- **Backend**: Express server that scrapes Zillow search results in real-time
- **Scoring**: Comp score algorithm based on bed/bath/sqft/location similarity
- **Enrichment**: Pulls property images and extracts value features from listing descriptions

## Project Structure

```
index.html      — Frontend UI
server.mjs      — Express API server + Zillow scraper
scraper.mjs     — CLI scraper + report generator
listings.json   — Cached listing data (demo)
report.txt      — Generated comp report
```

## License

MIT
