import { FIXTURE, FIXTURE_EFFECTS, fitsOn, fixtureAt, getVenueModel, MERCH, MERCH_KINDS } from '../game';
import { ArtThumb, money } from './bits';
import { useGame } from './context';
import { Icon } from './icons';

/** Floating card for whatever tile the player tapped. */
export function Inspector() {
  const { state, ui, setUi, act } = useGame();
  const at = ui.selected!;
  const f = fixtureAt(state.floor, at.x, at.y);
  const close = () => setUi({ selected: null });
  const storage = Object.values(state.artworks).filter((w) => w.status === 'storage');
  const canSell = getVenueModel(state.venue).canSell;
  const isDoor = state.floor.entrance.x === at.x && state.floor.entrance.y === at.y;

  let body;
  if (!f) {
    body = (
      <>
        <h3>{isDoor ? 'Entrance' : 'Empty floor'}</h3>
        <p class="muted">{isDoor ? 'Where visitors come in. Keep it clear.' : 'Open Build to put something here.'}</p>
        {!isDoor && (
          <button class="btn ghost" onClick={() => setUi({ building: true, build: null, selected: null })}>
            <Icon name="build" size={16} /> Build here
          </button>
        )}
      </>
    );
  } else if (FIXTURE[f.kind].display && f.artworkId) {
    const w = state.artworks[f.artworkId];
    const a = state.artists[w.artistId];
    const step = (pct: number) => Math.max(50, Math.round((w.price * pct) / 50) * 50);
    const ratio = w.price / w.value;
    body = (
      <>
        <div class="insp-art">
          <ArtThumb work={w} size="lg" />
          <div>
            <h3>“{w.title}”</h3>
            <p class="muted">
              {a.name} · {a.medium}
            </p>
            <p class="muted">
              Worth about {money(w.value)} · paid {money(w.acquiredFor)}
            </p>
          </div>
        </div>
        {canSell && (
          <div class="price-row">
            <button class="btn round" onClick={() => act({ type: 'setPrice', artworkId: w.id, price: step(0.9) })} aria-label="Lower price">
              −
            </button>
            <div>
              <b>{money(w.price)}</b>
              <small class={ratio > 1.6 ? 'bad' : ratio < 1 ? 'good' : 'muted'}>
                {ratio > 1.6 ? 'Hard to sell at this price' : ratio < 1 ? 'Priced to move' : 'Asking price'}
              </small>
            </div>
            <button class="btn round" onClick={() => act({ type: 'setPrice', artworkId: w.id, price: step(1.1) })} aria-label="Raise price">
              +
            </button>
          </div>
        )}
        <button class="btn ghost" onClick={() => act({ type: 'setDisplay', artworkId: w.id, display: false })}>
          Take down
        </button>
      </>
    );
  } else if (FIXTURE[f.kind].display) {
    const fits = storage.filter((w) => fitsOn(w, f.kind));
    const other = storage.length - fits.length;
    body = (
      <>
        <h3>{FIXTURE[f.kind].label} · empty</h3>
        {fits.length ? (
          <>
            <p class="muted">Tap a work to {f.kind === 'pedestal' ? 'put it' : 'hang it'} here.</p>
            <div class="strip">
              {fits.map((w) => (
                <button class="strip-item" onClick={() => act({ type: 'setDisplay', artworkId: w.id, display: true, fixtureId: f.id })}>
                  <ArtThumb work={w} />
                  <small>{w.title}</small>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p class="muted">
              {other
                ? f.kind === 'pedestal'
                  ? 'Nothing in storage stands on a pedestal. Sculpture does.'
                  : 'What’s in storage needs a pedestal, not a wall.'
                : 'Nothing in storage. Buy something first.'}
            </p>
            <button class="btn primary" onClick={() => setUi({ sheet: 'collection', artTab: 'owned', selected: null })}>
              Browse art for sale
            </button>
          </>
        )}
      </>
    );
  } else if (f.kind === 'shop') {
    const out = MERCH_KINDS.filter((k) => state.shop.lines[k].stock === 0);
    body = (
      <>
        <h3>Gift shop</h3>
        <p class="muted">
          Took {money(state.shop.takingsToday)} today.{' '}
          {out.length ? `Sold out: ${out.map((k) => MERCH[k].label.toLowerCase()).join(', ')}.` : 'Shelves stocked.'}
        </p>
        <button class="btn primary" onClick={() => setUi({ sheet: 'shop', selected: null })}>
          Prices and stock
        </button>
      </>
    );
  } else {
    const note =
      f.kind === 'bar'
        ? `Raises guest happiness at events by ${Math.round(FIXTURE_EFFECTS.barSatisfaction * 100)}%.`
        : f.kind === 'bench'
          ? state.venue === 'museum'
            ? `Brings ${Math.round(FIXTURE_EFFECTS.benchVisitorBonus * 100)}% more visitors.`
            : 'Somewhere to sit and look.'
          : 'Adds a bit of life.';
    body = (
      <>
        <h3>{FIXTURE[f.kind].label}</h3>
        <p class="muted">{note}</p>
      </>
    );
  }

  return (
    <div class="inspector">
      <button class="icon-btn corner" onClick={close} aria-label="Close">
        <Icon name="close" size={18} />
      </button>
      {body}
      {f && (
        <button
          class="link danger"
          onClick={() => {
            if (act({ type: 'removeFixture', fixtureId: f.id })) close();
          }}
        >
          Remove {FIXTURE[f.kind].label.toLowerCase()}
        </button>
      )}
    </div>
  );
}
