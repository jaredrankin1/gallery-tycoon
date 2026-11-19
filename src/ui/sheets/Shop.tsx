import { buyChance, FIXTURE, getVenueModel, MERCH, MERCH_KINDS, merchAppeal, RULES, SHOP, shopCounter, takingsPerVisitor, type MerchKind } from '../../game';
import { money, shortMoney, Sheet } from '../bits';
import { useGame } from '../context';

/** One step on the price buttons: $1 for cheap lines, $5 for dearer ones. */
const priceStep = (fair: number) => (fair >= 20 ? 5 : 1);

/** An icon per line so the list reads at a glance. */
const GLYPH: Record<MerchKind, string> = { postcard: '✉️', print: '🖼️', keychain: '🔑', tshirt: '👕' };

export function ShopSheet() {
  const { state, setUi, act, toast } = useGame();
  const counter = shopCounter(state);
  const shop = state.shop;
  const daily = getVenueModel(state.venue).expectedDailyVisitors(state);
  const perVisitor = takingsPerVisitor(state);
  const hasArt = merchAppeal(state, 'print') > 0;

  return (
    <Sheet title="Gift shop" onClose={() => setUi({ sheet: null })}>
      {!counter ? (
        <div class="budget">
          <b>No shop counter yet</b>
          <small class="muted">
            Build a gift shop on the floor ({shortMoney(FIXTURE.shop.cost)}) and it opens stocked with postcards, art prints, keychains and
            t-shirts. Visitors buy on their way round.
          </small>
          <button class="btn primary" onClick={() => setUi({ sheet: null, building: true, build: 'shop' })}>
            Build a gift shop
          </button>
        </div>
      ) : (
        <div class="summary">
          <div>
            <small>Today</small>
            <b class="good">{shortMoney(shop.takingsToday)}</b>
          </div>
          <div>
            <small>Per visitor</small>
            <b>${perVisitor.toFixed(2)}</b>
          </div>
          <div>
            <small>Est. a day</small>
            <b>{shortMoney(perVisitor * daily)}</b>
          </div>
        </div>
      )}

      <div class="list">
        {MERCH_KINDS.map((k) => {
          const cfg = MERCH[k];
          const line = shop.lines[k];
          const step = priceStep(cfg.fairPrice);
          const ratio = line.price / cfg.fairPrice;
          const orderQty = Math.min(cfg.batch, SHOP.maxStock - line.stock);
          const orderCost = orderQty * cfg.unitCost;
          const chance = buyChance(state, k);
          const low = line.stock < cfg.batch * SHOP.restockBelow;
          const priceNote =
            k === 'print' && !hasArt
              ? 'Hang some art: prints are of what’s on the walls'
              : ratio > 1.5
                ? 'Shoppers balk at this'
                : ratio < 1
                  ? 'Bargain: sells more'
                  : ratio === 1
                    ? 'Fair price'
                    : 'A bit dear';
          return (
            <div class="merch">
              <div class="row">
                <span class="merch-icon" aria-hidden="true">
                  {GLYPH[k]}
                </span>
                <div class="grow">
                  <b>{cfg.label}</b>
                  <small class={line.stock === 0 ? 'bad' : low ? 'warn' : 'muted'}>
                    {line.stock === 0 ? 'Sold out' : `${line.stock} in stock`} · {line.soldToday} sold today
                  </small>
                </div>
                <span class="stepper">
                  <button
                    class="btn round sm"
                    disabled={line.price - step < 1}
                    onClick={() => act({ type: 'setMerchPrice', kind: k, price: line.price - step })}
                    aria-label={`Lower ${cfg.plural} price`}
                  >
                    −
                  </button>
                  <b class="num merch-price">{money(line.price)}</b>
                  <button
                    class="btn round sm"
                    disabled={line.price + step > cfg.fairPrice * SHOP.maxPriceMultiple}
                    onClick={() => act({ type: 'setMerchPrice', kind: k, price: line.price + step })}
                    aria-label={`Raise ${cfg.plural} price`}
                  >
                    +
                  </button>
                </span>
              </div>
              <div class="row">
                <small class={ratio > 1.5 || (k === 'print' && !hasArt) ? 'bad' : 'muted'}>
                  {priceNote} · {Math.round(chance * 100)}% of visitors buy · costs you {money(cfg.unitCost)}
                </small>
                <button
                  class="btn tiny"
                  disabled={orderQty <= 0 || state.cash - orderCost < RULES.overdraftLimit}
                  onClick={() => {
                    if (act({ type: 'restockMerch', kind: k, batches: 1 })) toast(`Ordered ${orderQty} ${cfg.plural} for ${money(orderCost)}.`);
                  }}
                >
                  {orderQty > 0 ? `+${orderQty} for ${shortMoney(orderCost)}` : 'Shelves full'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <label class="toggle-row">
        <input type="checkbox" checked={shop.autoRestock} onChange={(e) => act({ type: 'setAutoRestock', on: (e.target as HTMLInputElement).checked })} />
        <span>
          <b>Restock overnight</b>
          <small class="muted">Reorders a batch of anything selling that’s running low, if you have the cash.</small>
        </span>
      </label>
      <p class="hint">T-shirts sell on your reputation, and each one worn around town brings in a little buzz.</p>
    </Sheet>
  );
}
