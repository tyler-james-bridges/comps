import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import {
  BUILDER_CODE,
  builderCodeResourceServerExtension,
  declareBuilderCodeExtension,
} from '@x402/extensions/builder-code';

const BASE_NETWORK = 'eip155:8453';
const BASE_BUILDER_CODE = 'bc_jhxtiha3';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const FACILITATOR_URL = process.env.X402_FACILITATOR_BASE || 'https://facilitator.payai.network';
const PAY_TO = process.env.COMPS_PAY_TO || '0x668aDd9213985E7Fd613Aec87767C892f4b9dF1c';
const PREVIEW_MODE = process.env.X402_PREVIEW_MODE === '1' || process.env.X402_PREVIEW_MODE === 'true';

class VercelAdapter {
  constructor(req) { this.req = req; }
  getHeader(name) {
    const value = this.req.headers?.[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
  getMethod() { return this.req.method || 'GET'; }
  getPath() { return new URL(this.getUrl()).pathname; }
  getUrl() {
    const host = this.getHeader('host') || 'localhost';
    const proto = this.getHeader('x-forwarded-proto') || 'https';
    return new URL(this.req.url || '/api/search', `${proto}://${host}`).toString();
  }
  getAcceptHeader() { return this.getHeader('accept') || 'application/json'; }
  getUserAgent() { return this.getHeader('user-agent') || ''; }
  getBody() { return this.req.body; }
}

function makeScheme() {
  const scheme = new ExactEvmScheme();
  scheme.registerMoneyParser(async (amount, network) => {
    if (network !== BASE_NETWORK) return null;
    return {
      amount: Math.round(amount * 1e6).toString(),
      asset: BASE_USDC,
      extra: { name: 'USD Coin', version: '2', decimals: 6 },
    };
  });
  return scheme;
}

let serverPromise;
async function getServer() {
  if (!serverPromise) {
    serverPromise = (async () => {
      const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL }))
        .register(BASE_NETWORK, makeScheme())
        .registerExtension(builderCodeResourceServerExtension);
      const httpServer = new x402HTTPResourceServer(resourceServer, {
        'POST /api/search': {
          accepts: [{ scheme: 'exact', payTo: PAY_TO, price: '0.25', network: BASE_NETWORK }],
          description: 'Rent Check: scored rental comps and suggested market rent range.',
          mimeType: 'application/json',
          extensions: {
            [BUILDER_CODE]: declareBuilderCodeExtension(BASE_BUILDER_CODE),
          },
          unpaidResponseBody: async () => ({
            contentType: 'application/json',
            body: { error: 'Payment required', price_usdc: 0.25, network: 'base' },
          }),
        },
      });
      await httpServer.initialize();
      return httpServer;
    })();
  }
  return serverPromise;
}

function sendInstruction(res, instruction) {
  for (const [key, value] of Object.entries(instruction.headers)) res.setHeader(key, value);
  if (instruction.body === undefined) return res.status(instruction.status).end();
  if (typeof instruction.body === 'string') return res.status(instruction.status).send(instruction.body);
  return res.status(instruction.status).json(instruction.body);
}

async function verifyPayment(req, res) {
  const adapter = new VercelAdapter(req);
  const context = {
    adapter,
    path: adapter.getPath(),
    method: adapter.getMethod(),
    paymentHeader: adapter.getHeader('x-payment') || adapter.getHeader('x-x402-payment'),
  };
  const result = await (await getServer()).processHTTPRequest(context);
  if (result.type === 'payment-error') {
    sendInstruction(res, result.response);
    return null;
  }
  return result.type === 'payment-verified' ? { ...result, context } : { context };
}

export async function withPayment(req, res, handler) {
  const verified = PREVIEW_MODE ? null : await verifyPayment(req, res);
  if (!PREVIEW_MODE && !verified) return;

  const result = await handler();
  const status = result.status || 200;
  const body = JSON.stringify(result.body);
  res.setHeader('Content-Type', 'application/json');
  if (PREVIEW_MODE || status >= 400 || !verified.paymentPayload) return res.status(status).send(body);

  const settlement = await (await getServer()).processSettlement(
    verified.paymentPayload,
    verified.paymentRequirements,
    verified.declaredExtensions,
    { request: verified.context, responseBody: Buffer.from(body) },
  );
  if (!settlement.success) {
    return res.status(402).json({ error: 'Payment settlement failed', detail: settlement.errorMessage || settlement.errorReason });
  }
  for (const [key, value] of Object.entries(settlement.headers)) res.setHeader(key, value);
  return res.status(status).send(body);
}
