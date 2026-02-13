// Vercel serverless function for rental search

export const config = {
  maxDuration: 30,
};

async function searchZillow({ location, minBeds, maxBeds, minBaths, maxBaths, minSqft, maxSqft, minPrice, maxPrice }) {
  const slugMap = {
    'moon valley': 'moon-valley-canyon-phoenix-az',
    '85022': 'phoenix-az-85022',
    '85023': 'phoenix-az-85023',
    '85020': 'phoenix-az-85020',
    '85024': 'phoenix-az-85024',
    '85028': 'phoenix-az-85028',
    '85032': 'phoenix-az-85032',
    '85050': 'phoenix-az-85050',
    '85016': 'phoenix-az-85016',
    '85018': 'phoenix-az-85018',
    '85014': 'phoenix-az-85014',
    '85015': 'phoenix-az-85015',
    '85029': 'phoenix-az-85029',
    '85051': 'phoenix-az-85051',
    '85053': 'phoenix-az-85053',
  };

  const locLower = location.toLowerCase().trim();
  let slug = slugMap[locLower];

  if (!slug) {
    const zipMatch = locLower.match(/\b(\d{5})\b/);
    if (zipMatch) {
      slug = `phoenix-az-${zipMatch[1]}`;
    } else {
      slug = locLower
        .replace(/[,]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      if (!slug.includes('-az')) slug += '-az';
    }
  }

  const filterState = {
    fr: { value: true },
    fsba: { value: false },
    fsbo: { value: false },
    nc: { value: false },
    cmsn: { value: false },
    auc: { value: false },
    fore: { value: false },
    tow: { value: false },
    mf: { value: false },
    con: { value: false },
    land: { value: false },
    apa: { value: false },
    manu: { value: false },
  };

  if (minBeds) filterState.beds = { min: minBeds };
  if (maxBeds) filterState.beds = { ...filterState.beds, max: maxBeds };
  if (minBaths) filterState.baths = { min: minBaths };
  if (maxBaths) filterState.baths = { ...filterState.baths, max: maxBaths };
  if (minSqft || maxSqft) filterState.sqft = {};
  if (minSqft) filterState.sqft.min = minSqft;
  if (maxSqft) filterState.sqft.max = maxSqft;
  if (minPrice || maxPrice) filterState.mp = {};
  if (minPrice) filterState.mp.min = minPrice;
  if (maxPrice) filterState.mp.max = maxPrice;

  const searchQueryState = JSON.stringify({ isMapVisible: true, filterState });
  const url = `https://www.zillow.com/${slug}/rentals/?searchQueryState=${encodeURIComponent(searchQueryState)}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const html = await res.text();
  const listings = [];

  function extractListings(data) {
    for (const item of data) {
      if (!item.addressStreet && !item.address) continue;
      const addr = item.addressStreet
        ? `${item.addressStreet}, ${item.addressCity}, ${item.addressState} ${item.addressZipcode}`
        : item.address;

      let image = null;
      if (item.imgSrc) image = item.imgSrc;
      else if (item.carouselPhotos?.length) image = item.carouselPhotos[0].url;
      else if (item.photos?.length) image = item.photos[0];

      const highlights = [];
      if (item.lotAreaString) highlights.push(item.lotAreaString + ' lot');
      if (item.hasGarage) highlights.push('Garage');
      if (item.has3DModel || item.has3DTour) highlights.push('3D Tour');
      if (item.hasPool) highlights.push('Pool');
      if (item.isNewConstruction) highlights.push('New Build');
      if (item.yearBuilt) highlights.push(`Built ${item.yearBuilt}`);
      if (item.propertyTypeDimension) highlights.push(item.propertyTypeDimension);
      if (item.listingSubType?.is_openHouse) highlights.push('Open House');

      listings.push({
        address: addr,
        price: item.unformattedPrice || item.price,
        beds: item.beds,
        baths: item.baths,
        sqft: item.area || item.livingArea,
        zip: item.addressZipcode,
        url: item.detailUrl?.startsWith('http') ? item.detailUrl : `https://www.zillow.com${item.detailUrl}`,
        daysListed: item.timeOnZillow || 'New',
        lat: item.latLong?.latitude || item.latitude,
        lng: item.latLong?.longitude || item.longitude,
        image,
        highlights,
        yearBuilt: item.yearBuilt,
        source: 'zillow',
      });
    }
  }

  // Method 1: listResults
  const listingRegex = /"listResults"\s*:\s*(\[[\s\S]*?\])\s*,\s*"(?:mapResults|resultsHash)/;
  const match = html.match(listingRegex);
  if (match) {
    try { extractListings(JSON.parse(match[1])); } catch (e) {}
  }

  // Method 2: cat1
  if (listings.length === 0) {
    const stateRegex = /"cat1".*?"searchResults".*?"listResults"\s*:\s*(\[[\s\S]*?\])/;
    const stateMatch = html.match(stateRegex);
    if (stateMatch) {
      try { extractListings(JSON.parse(stateMatch[1])); } catch (e) {}
    }
  }

  // Method 3: __NEXT_DATA__
  if (listings.length === 0) {
    const nextDataRegex = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
    const ndMatch = html.match(nextDataRegex);
    if (ndMatch) {
      try {
        const nd = JSON.parse(ndMatch[1]);
        const results = nd?.props?.pageProps?.searchPageState?.cat1?.searchResults?.listResults;
        if (results) extractListings(results);
      } catch (e) {}
    }
  }

  // Enrich top 5 with detail page data (skip on Vercel to stay fast)
  const enrichPromises = listings.slice(0, 5).map(async (l) => {
    if (l.image && l.highlights.length > 0) return;
    try {
      const detailRes = await fetch(l.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
      });
      const detailHtml = await detailRes.text();

      if (!l.image) {
        const imgMatch = detailHtml.match(/"url"\s*:\s*"(https:\/\/photos\.zillowstatic\.com\/[^"]+)"/);
        if (imgMatch) l.image = imgMatch[1];
      }

      if (l.highlights.length === 0) {
        const descMatch = detailHtml.match(/"description"\s*:\s*"([^"]{0,2000})"/);
        if (descMatch) {
          const desc = descMatch[1].toLowerCase();
          const valueTags = [
            [/pool/, 'Pool'], [/garage/, 'Garage'], [/renovated|remodel|updated/, 'Updated'],
            [/granite/, 'Granite'], [/hardwood/, 'Hardwood Floors'], [/stainless/, 'Stainless Appliances'],
            [/mountain view|city view/, 'Views'], [/gated/, 'Gated'], [/solar/, 'Solar'],
            [/new roof/, 'New Roof'], [/new paint|fresh paint/, 'Fresh Paint'],
            [/new floor|new carpet|new tile/, 'New Flooring'], [/fireplace/, 'Fireplace'],
            [/rv gate|rv parking/, 'RV Parking'], [/corner lot/, 'Corner Lot'],
            [/cul.de.sac/, 'Cul-de-sac'], [/no hoa/, 'No HOA'],
          ];
          for (const [regex, tag] of valueTags) {
            if (regex.test(desc) && !l.highlights.includes(tag)) l.highlights.push(tag);
          }
        }
      }
    } catch (e) {}
  });

  await Promise.all(enrichPromises);

  return { listings, url, slug };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { location, minBeds, maxBeds, minBaths, maxBaths, minSqft, maxSqft, minPrice, maxPrice, myBeds, myBaths, mySqft, myZip } = req.body;

    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

    const result = await searchZillow({
      location, minBeds, maxBeds, minBaths, maxBaths, minSqft, maxSqft, minPrice, maxPrice,
    });

    if (myBeds || myBaths || mySqft) {
      for (const l of result.listings) {
        let score = 100;
        if (myBeds) score -= Math.abs(l.beds - myBeds) * 15;
        if (myBaths) score -= Math.abs(l.baths - myBaths) * 10;
        if (mySqft && l.sqft) score -= Math.floor(Math.abs(l.sqft - mySqft) / 100) * 5;
        else if (mySqft) score -= 10;
        if (myZip && l.zip === myZip) score += 10;
        l.compScore = Math.max(0, Math.min(100, score));
      }
      result.listings.sort((a, b) => b.compScore - a.compScore);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
