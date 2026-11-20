import { useState } from 'preact/hooks';
import { ASSISTANT, buildReserve, getVenueModel, RULES } from '../../game';
import { ArtThumb, Avatar, money, Seg, Sheet, shortMoney } from '../bits';
import { useGame } from '../context';

export function CollectionSheet() {
  const { state, setUi, act, toast } = useGame();
  const owned = Object.values(state.artworks).filter((w) => w.status === 'storage' || w.status === 'display');
  const [tab, setTab] = useState<'market' | 'owned'>('market');
  const offers = Object.values(state.artworks)
    .filter((w) => w.status === 'offered' && !w.withArtist)
    .sort((a, b) => a.price - b.price);
  const canSell = getVenueModel(state.venue).canSell;
  const autoHang = !!state.staff?.autoHang;

  return (
    <Sheet title="Art" onClose={() => setUi({ sheet: null })}>
      <Seg
        options={[
          { value: 'market', label: `For sale (${offers.length})` },
          { value: 'owned', label: `Yours (${owned.length})` },
        ]}
        value={tab}
        onPick={setTab}
      />

      <button class={`autohang ${autoHang ? 'on' : ''}`} role="switch" aria-checked={autoHang} onClick={() => act({ type: 'setAutoHang', on: !autoHang })}>
        <span class="grow">
          <b>{ASSISTANT.name} hangs art</b>
          <small class="muted">
            {autoHang
              ? `New pieces and anything in storage: she finds a spot, builds one while cash stays above ${money(buildReserve(state))}, or swaps out a weaker piece. Pieces you take down stay down.`
              : 'Off: new pieces wait in storage for you to place.'}
          </small>
        </span>
        <span class="knob" aria-hidden="true" />
      </button>

      {tab === 'market' && (
        <>
          <p class="hint">New works turn up every day. Friends of yours offer more often, and cheaper.</p>
          <div class="art-grid">
            {offers.map((w) => {
              const a = state.artists[w.artistId];
              const daysLeft = w.day - state.day;
              const deal = w.price < w.value;
              return (
                <div class="art-card">
                  <ArtThumb work={w} size="lg" />
                  <b class="clamp">“{w.title}”</b>
                  <span class="by">
                    <Avatar artist={a} size="sm" /> {a.name}
                  </span>
                  <small class="muted">
                    Worth {money(w.value)}
                    {daysLeft <= 1 ? ' · last day' : ` · ${daysLeft + 1} days left`}
                  </small>
                  <button
                    class={`btn ${deal ? 'primary' : ''}`}
                    disabled={state.cash - w.price < RULES.overdraftLimit}
                    onClick={() => {
                      if (act({ type: 'buyArtwork', artworkId: w.id }) && !autoHang) toast(`Bought “${w.title}”. It’s in storage under Yours.`);
                    }}
                  >
                    Buy {money(w.price)}
                  </button>
                </div>
              );
            })}
          </div>
          {!offers.length && <p class="hint">Nothing on offer right now. Check back tomorrow.</p>}
        </>
      )}

      {tab === 'owned' && (
        <>
          {!owned.length && <p class="hint">You don’t own any art yet.</p>}
          <div class="list">
            {owned.map((w) => {
              const a = state.artists[w.artistId];
              const hanging = w.status === 'display';
              return (
                <div class="list-row">
                  <ArtThumb work={w} />
                  <div class="grow">
                    <b>“{w.title}”</b>
                    <small class="muted">
                      {a.name}
                      {w.commissioned && <span class="gold"> · commissioned</span>}
                    </small>
                    <small class="muted">
                      Worth {shortMoney(w.value)}
                      {w.acquiredFor > 0 && w.value !== w.acquiredFor && (
                        <span class={w.value > w.acquiredFor ? 'up' : 'down'}>
                          {' '}
                          {w.value > w.acquiredFor ? '▲' : '▼'}
                          {Math.abs(Math.round(((w.value - w.acquiredFor) / w.acquiredFor) * 100))}%
                        </span>
                      )}
                      {canSell && ` · asking ${shortMoney(w.price)}`}
                    </small>
                  </div>
                  {hanging ? (
                    <button class="btn tiny ghost" onClick={() => act({ type: 'setDisplay', artworkId: w.id, display: false })}>
                      Take down
                    </button>
                  ) : (
                    <button class="btn tiny primary" onClick={() => act({ type: 'setDisplay', artworkId: w.id, display: true })}>
                      {w.form === 'sculpture' ? 'Place' : 'Hang'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Sheet>
  );
}
