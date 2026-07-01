# Rent Check

Tell Seal a rental location and optional property specs, then return one JSON card with scored rental comps and the rent range the market supports.

Author: Tyler (tmoney_145)
Price: $0.25 per report

## Confirmed Production Host

Use `https://comps-rosy-one.vercel.app/api/search`.

`https://comps.vercel.app/api/search` returns `405`, and `https://comps.0x402.sh` did not resolve during verification.

## Endpoint

`POST /api/search`

Body accepts `ask` as a natural-language rent-check question.

Structured input is also accepted:

Structured input accepts `location`, optional `beds`, optional `baths`, and optional `sqft`.

The endpoint is x402-gated on Base USDC. Missing specs are filled from market medians when listings are available. Missing location, thin markets, and scraper failures return a valid Rent Check card rather than raw 4xx/5xx JSON.

## Card Contract

Returns pure JSON with `ok`, `type`, `subject`, `suggestedRange`, `comps`, `verdict`, and `summary`. Each comp includes address, bed/bath/sqft fields when available, rent, price per square foot, days on market, comp score, and URL when available.

Scope is rentals only. Do not add sale comps, maps, saved properties, or images to the card.
