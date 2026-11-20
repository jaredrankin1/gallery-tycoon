import { AUCTION, askingBid, RULES, weekday, withPremium } from '../../game';
import { ArtThumb, Avatar, money } from '../bits';
import { useGame } from '../context';

/** The auction house's weekly sale: lots on view, then a day of bidding. */
export function AuctionPanel() {
  const { state, act } = useGame();
  const sale = state.auction;
  if (!sale) return <p class="hint">No sale catalogued yet.</p>;
  const live = sale.day === state.day;
  const inDays = sale.day - state.day;
  const premium = Math.round(AUCTION.buyersPremium * 100);

  return (
    <>
      <div class={`sale-head ${live ? 'live' : ''}`}>
        <div class="sale-date">
          <small>{weekday(sale.day)}</small>
          <b>{live ? 'Live' : inDays === 1 ? 'Tmrw' : `${inDays}d`}</b>
        </div>
        <div class="grow">
          <b>{sale.house}</b>
          <small class="muted">
            {live ? 'Sale on now. Bidding closes at midnight.' : `On view. Bidding opens ${inDays === 1 ? 'tomorrow' : weekday(sale.day)}.`} Buyer’s premium {premium}%.
          </small>
        </div>
      </div>
      <p class="hint">Cheaper than a dealer when the room is quiet, dearer when it isn’t. Raise your paddle one step at a time.</p>

      <div class="list">
        {sale.lots.map((lot, i) => {
          const w = state.artworks[lot.artworkId];
          const a = w && state.artists[w.artistId];
          const ask = askingBid(lot);
          const open = lot.state === 'open';
          return (
            <div class={`lot ${lot.state} ${lot.leader === 'room' && open ? 'outbid' : ''}`}>
              <div class="lot-top">
                <span class="lot-no">{i + 1}</span>
                {w ? <ArtThumb work={w} /> : <span class="thumb md" />}
                <div class="grow">
                  <b>{w ? `“${w.title}”` : 'Sold elsewhere'}</b>
                  {a && (
                    <span class="by">
                      <Avatar artist={a} size="sm" /> <small class="muted">{a.name}</small>
                    </span>
                  )}
                  <small class="muted">
                    Estimate {money(lot.low)}–{money(lot.high)}
                  </small>
                </div>
              </div>

              {lot.call && <p class="lot-call">{lot.call}</p>}

              {open && live && (
                <div class="lot-bid">
                  <small class="muted grow">
                    {lot.bid ? (
                      <>
                        Room has it at <b class="num">{money(lot.bid)}</b>
                      </>
                    ) : (
                      'No bids yet'
                    )}
                  </small>
                  <button class="btn tiny ghost" onClick={() => act({ type: 'auctionPass', lot: i })}>
                    Let it go
                  </button>
                  <button
                    class="btn tiny primary"
                    disabled={state.cash - withPremium(ask) < RULES.overdraftLimit}
                    title={`${money(withPremium(ask))} with premium`}
                    onClick={() => act({ type: 'auctionBid', lot: i })}
                  >
                    Bid {money(ask)}
                  </button>
                </div>
              )}
              {open && !live && <small class="muted lot-status">Opens at {money(ask)}</small>}
              {lot.state === 'won' && <small class="lot-status won-tag">Yours · {money(withPremium(lot.hammer!))} with premium</small>}
              {lot.state === 'lost' && <small class="muted lot-status">Sold to another bidder</small>}
              {lot.state === 'passed' && <small class="muted lot-status">Unsold</small>}
            </div>
          );
        })}
      </div>
    </>
  );
}
