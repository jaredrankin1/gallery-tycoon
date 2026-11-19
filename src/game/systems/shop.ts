import { MERCH, SHOP } from '../config';
import { clamp, type Rng } from '../rng';
import type { GameState, GiftShop, MerchKind } from '../types';
import { notify } from './feed';
import { post } from './ledger';

export const MERCH_KINDS = Object.keys(MERCH) as MerchKind[];

export function createShop(): GiftShop {
  const lines = {} as GiftShop['lines'];
  for (const k of MERCH_KINDS) lines[k] = { stock: 0, price: MERCH[k].fairPrice, soldToday: 0, soldTotal: 0 };
  return { lines, autoRestock: true, takingsToday: 0 };
}

/** The gift shop counter on the floor, if one has been built. Nothing sells without it. */
export const shopCounter = (state: GameState) => state.floor.fixtures.find((f) => f.kind === 'shop');

/** How price moves demand: a bargain sells a bit more, every step above fair hurts a lot. */
export function merchPriceDemand(price: number, fairPrice: number): number {
  const r = price / Math.max(0.01, fairPrice);
  return r <= 1 ? clamp(1 + (1 - r) * 0.8, 0, 1.8) : clamp(1 / (r * r), 0, 1);
}

/**
 * What makes each line sell, on top of price. Prints need art on the walls and
 * sell on the fame of what's there. T-shirts sell on the venue's own name.
 */
export function merchAppeal(state: GameState, kind: MerchKind): number {
  if (kind === 'print') {
    const shown = Object.values(state.artworks).filter((w) => w.status === 'display');
    if (!shown.length) return 0;
    const topFame = Math.max(...shown.map((w) => state.artists[w.artistId]?.fame ?? 0));
    return clamp(0.4 + topFame / 100 + shown.length * 0.05, 0, 1.8);
  }
  if (kind === 'tshirt') return clamp(state.reputation / 40, 0.2, 2);
  return 1;
}

/** Chance one visitor buys one of this line right now. */
export function buyChance(state: GameState, kind: MerchKind, spend = 1): number {
  const line = state.shop.lines[kind];
  const cfg = MERCH[kind];
  return clamp(
    cfg.buyChance *
      merchPriceDemand(line.price, cfg.fairPrice) *
      merchAppeal(state, kind) *
      SHOP.venueSpend[state.venue] *
      (0.6 + state.reputation / 100) *
      spend,
    0,
    0.95,
  );
}

/** Expected takings per visitor at current prices (ignores stock), for the shop panel. */
export function takingsPerVisitor(state: GameState): number {
  return MERCH_KINDS.reduce((sum, k) => sum + buyChance(state, k) * state.shop.lines[k].price, 0);
}

/**
 * Some of the people who came in this hour stop at the counter. `spend` scales
 * how keen they are (event crowds buy more). Returns the money taken.
 */
export function shopSales(state: GameState, rng: Rng, visitors: number, spend = 1): number {
  const counter = shopCounter(state);
  if (!counter || visitors <= 0) return 0;
  let takings = 0;
  for (const k of MERCH_KINDS) {
    const line = state.shop.lines[k];
    if (line.stock <= 0) continue;
    const sold = Math.min(line.stock, Math.floor(visitors * buyChance(state, k, spend) + rng.next()));
    if (sold <= 0) continue;
    line.stock -= sold;
    line.soldToday += sold;
    line.soldTotal += sold;
    takings += sold * line.price;
    if (k === 'tshirt') state.buzz += sold * SHOP.tshirtBuzz;
    if (line.stock === 0 && !state.shop.autoRestock) {
      notify(state, { kind: 'warn', text: `${MERCH[k].label} sold out at the gift shop. Restock from the counter.` });
    }
  }
  if (takings > 0) {
    post(state, 'shop', takings, 'Gift shop sales', true);
    state.shop.takingsToday += takings;
    notify(state, { kind: 'shop', text: 'Gift shop sale', amount: takings, at: { x: counter.x, y: counter.y }, quiet: true });
  }
  return takings;
}

/** Room left on the shelf for this line. */
export const shelfSpace = (state: GameState, kind: MerchKind) => SHOP.maxStock - state.shop.lines[kind].stock;

/** Buys `qty` units wholesale. Returns an error, or undefined on success. */
export function orderStock(state: GameState, kind: MerchKind, qty: number, note?: string): string | undefined {
  const cfg = MERCH[kind];
  const n = Math.min(Math.floor(qty), shelfSpace(state, kind));
  if (n <= 0) return `The stockroom is full of ${cfg.plural}.`;
  const cost = n * cfg.unitCost;
  post(state, 'shop', -cost, note ?? `Stocked ${n} ${cfg.plural}`);
  state.shop.lines[kind].stock += n;
  return undefined;
}

/** A new counter comes with one batch of everything on the shelves. */
export function openingStock(state: GameState): void {
  for (const k of MERCH_KINDS) {
    const line = state.shop.lines[k];
    line.stock = Math.max(line.stock, Math.min(SHOP.maxStock, MERCH[k].batch));
  }
}

/** Midnight: the day's summary, then auto-restock anything running low. */
export function shopEndOfDay(state: GameState): void {
  const shop = state.shop;
  if (shop.takingsToday > 0) {
    const units = MERCH_KINDS.reduce((n, k) => n + shop.lines[k].soldToday, 0);
    notify(state, { kind: 'shop', text: `Gift shop: ${units} items sold today, $${shop.takingsToday.toLocaleString('en-US')} taken`, amount: shop.takingsToday });
  }
  if (shop.autoRestock && shopCounter(state)) {
    for (const k of MERCH_KINDS) {
      const cfg = MERCH[k];
      // Only reorder what's actually selling, and never into the overdraft.
      if (shop.lines[k].stock >= cfg.batch * SHOP.restockBelow || shop.lines[k].soldTotal === 0) continue;
      if (state.cash - cfg.batch * cfg.unitCost < 0) continue;
      orderStock(state, k, cfg.batch, `Restocked ${cfg.plural} (auto)`);
    }
  }
  shop.takingsToday = 0;
  for (const k of MERCH_KINDS) shop.lines[k].soldToday = 0;
}
