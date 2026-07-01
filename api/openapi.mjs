const BASE = 'https://comps-rosy-one.vercel.app';

export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({
    openapi: '3.1.0',
    info: {
      title: 'Comps Rent Check',
      version: '1.0.0',
      description:
        'x402-paid rental comp analysis. Agents can submit a location and optional property specs to receive scored rental comps and a suggested rent range.',
      'x-guidance':
        'Call POST /api/search with either a natural-language ask or structured location, beds, baths, and sqft fields. The route is payable with x402 on Base USDC and returns a rent_check card. Missing specs use market medians when comps are available.',
      contact: { url: BASE },
    },
    servers: [{ url: BASE }],
    paths: {
      '/api/search': {
        post: {
          operationId: 'rent_check',
          summary: 'Find rental comps and suggested rent range',
          tags: ['Rentals', 'x402'],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: '0.250000' },
            protocols: [{ x402: {} }],
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ask: { type: 'string', description: 'Natural-language rent-check question.' },
                    location: { type: 'string', description: 'ZIP, neighborhood, or city.' },
                    beds: { type: 'number' },
                    baths: { type: 'number' },
                    sqft: { type: 'number' },
                  },
                  anyOf: [{ required: ['ask'] }, { required: ['location'] }],
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Rent Check card',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['ok', 'type', 'subject', 'suggestedRange', 'comps', 'verdict', 'summary'],
                    properties: {
                      ok: { type: 'boolean' },
                      type: { const: 'rent_check' },
                      subject: { type: 'object' },
                      suggestedRange: { type: ['object', 'null'] },
                      comps: { type: 'array', items: { type: 'object' } },
                      verdict: { type: 'string' },
                      summary: { type: 'string' },
                    },
                  },
                },
              },
            },
            '402': { description: 'Payment Required' },
          },
        },
      },
    },
  });
}
