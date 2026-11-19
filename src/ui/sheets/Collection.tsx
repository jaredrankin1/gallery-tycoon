import { useState } from 'preact/hooks';
import { getVenueModel, RULES } from '../../game';
import { ArtThumb, Avatar, money, Seg, Sheet } from '../bits';
import { useGame } from '../context';

export function CollectionSheet() {
  const { state, setUi, act, toast } = useGame();
  const owned = Object.values(state.artworks).filter((w) => w.status === 'storage' || w.status === 'display');
  const [tab, setTab] = useState<'market' | 'owned'>('market');
  const offers = Object.values(state.artworks)
    .filter((w) => w.status === 'offered')
    .sort((a, b) => a.price - b.price);
  const canSell = getVenueModel(state.venue).canSell;

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
                      if (act({ type: 'buyArtwork', artworkId: w.id })) toast(`Bought “${w.title}”. It’s in storage under Yours.`);
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
                      {a.name} · {canSell ? `asking ${money(w.price)}` : `worth ${money(w.value)}`}
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
