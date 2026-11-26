import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCommercialPrice } from '../../src/lib/commercial-pricing';
import { fetchBackendPricing } from '../../src/lib/edge-pricing';

const quote = { pix: '1615.00', card: { installments: 12, installment: '159.90', total: '1918.80' },
  promo_pix: '999.00', promo_card: { installments: 12, installment: '99.00', total: '1188.00' }, anchor_full: '1615.00', has_discount: false };

describe('backend commercial quote contract', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('applies canonical promotional prices (12x R$ 99 / R$ 999 Pix) universally on direct access without referral', () => {
    const directPrice = parseCommercialPrice(quote, false);
    expect(directPrice.hasDiscount).toBe(true);
    expect(directPrice.pixTotal).toBe(999);
    expect(directPrice.perMonth).toBe(99);
    expect(directPrice.cardTotal).toBe(1188);
    expect(directPrice.full - directPrice.pixTotal).toBe(616);
  });
  it('applies promotional prices (12x R$ 99 / R$ 999 Pix) when referral is present', () => {
    const promoPrice = parseCommercialPrice(quote, true);
    expect(promoPrice.hasDiscount).toBe(true);
    expect(promoPrice.perMonth).toBe(99);
    expect(promoPrice.cardTotal).toBe(1188);
    expect(promoPrice.pixTotal).toBe(999);
    expect(promoPrice.full - promoPrice.pixTotal).toBe(616);
  });
  it('parses canonical /v1/catalog/pricing payload with promo_card=null', () => {
    const v2Price = parseCommercialPrice({
      pix: '1615.00',
      card: { installments: 12, installment: '159.90', total: '1918.80' },
      promo_pix: '999.00',
      promo_card: null,
      anchor_full: '1615.00',
      updated_at: '2026-11-26T00:00:00.000Z',
    });
    expect(v2Price.installments).toBe(12);
    expect(v2Price.perMonth).toBe(159.9);
    expect(v2Price.cardTotal).toBe(1918.8);
    expect(v2Price.pixTotal).toBe(999);
    expect(v2Price.hasDiscount).toBe(true);
  });
  it('fetchBackendPricing requests https://api.supletivo.net.br/v1/catalog/pricing', async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({
        pix: '1615.00',
        card: { installments: 12, installment: '159.90', total: '1918.80' },
        promo_pix: '999.00',
        promo_card: null,
        anchor_full: '1615.00',
        updated_at: '2026-11-26T00:00:00.000Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    const payload = await fetchBackendPricing('PROMO123');
    expect(requestedUrls[0]).toBe('https://api.supletivo.net.br/v1/catalog/pricing?ref=PROMO123');
    expect(payload.promo_pix).toBe('999.00');
  });
  it('rejects missing fields and conflicting card totals rather than inventing a price', () => {
    expect(() => parseCommercialPrice({ ...quote, promo_card: { ...quote.promo_card, total: '1000' } })).toThrow();
    expect(() => parseCommercialPrice({ pix: '999' })).toThrow();
  });
});
