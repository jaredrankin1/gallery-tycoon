import { useState } from 'preact/hooks';
import {
  EXHIBITION,
  EXHIBITION_THEMES,
  exhibitionCost,
  liveScore,
  RULES,
  synergy,
  themeTitle,
  type ExhibitionTheme,
  type GameState,
} from '../../game';
import { ArtThumb, Avatar, Meter, money } from '../bits';
import { useGame } from '../context';
import { Icon } from '../icons';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Every theme you could run, best fit for your walls first. */
function themeOptions(state: GameState) {
  const tagThemes: ExhibitionTheme[] = EXHIBITION_THEMES.map((t) => ({ kind: 'tag', tag: t.tag }));
  const soloThemes: ExhibitionTheme[] = Object.keys(state.artists).map((id) => ({ kind: 'solo', artistId: id }));
  return [...tagThemes, ...soloThemes]
    .map((theme) => ({ theme, syn: synergy(state, theme) }))
    .sort((a, b) => b.syn.onTheme.length - a.syn.onTheme.length || b.syn.score - a.syn.score);
}

const sameTheme = (a: ExhibitionTheme, b: ExhibitionTheme) =>
  a.kind === b.kind && (a.kind === 'solo' ? a.artistId === (b as typeof a).artistId : a.tag === (b as typeof a).tag);

export function ExhibitionPanel() {
  const { state } = useGame();
  return state.exhibition ? <RunningShow /> : <PlanShow />;
}

function RunningShow() {
  const { state, act, toast } = useGame();
  const ex = state.exhibition!;
  const syn = synergy(state, ex.theme);
  const left = ex.endDay - state.day;
  return (
    <div class="show">
      <div class="show-head">
        <small class="muted">Now showing · {left === 0 ? 'last day' : `${left + 1} days left`}</small>
        <h3>{ex.title}</h3>
        <span class="stars big">{stars(ex.stars)}</span>
      </div>
      <div class="show-stats">
        <div>
          <b>{ex.visitors}</b>
          <small>visitors</small>
        </div>
        <div>
          <b>{ex.sales}</b>
          <small>sold</small>
        </div>
        <div>
          <b>{money(ex.revenue)}</b>
          <small>takings</small>
        </div>
      </div>
      <span class="label">
        Synergy now <b class="num">{pct(syn.score)}</b>
      </span>
      <Meter value={syn.score} max={1} tone={syn.score >= 0.6 ? 'good' : syn.score < 0.3 ? 'bad' : 'accent'} />
      <p class="hint">
        Crowds are up {pct(EXHIBITION.crowdBoost * liveScore(state))}. On-theme works sell faster. Swap pictures and the synergy follows.
      </p>
      <Bonuses syn={syn} />
      <button
        class="btn ghost wide"
        onClick={() => {
          if (act({ type: 'closeExhibition' })) toast(`“${ex.title}” is down.`);
        }}
      >
        Close the show early
      </button>
    </div>
  );
}

function PlanShow() {
  const { state, act, toast } = useGame();
  const all = themeOptions(state);
  const [pick, setPick] = useState<ExhibitionTheme | null>(null);
  const chosen = pick ? all.find((o) => sameTheme(o.theme, pick)) ?? all[0] : all[0];
  const { theme, syn } = chosen;
  // Only themes something on the walls fits, so the list stays short.
  const options = all.filter((o) => o.syn.onTheme.length > 0 || o === chosen);
  const ready = syn.onTheme.length >= EXHIBITION.minWorks;
  const cost = exhibitionCost(syn.onTheme.length);

  return (
    <div class="show">
      <p class="hint">
        Pick a theme, then hang works that fit it. A show runs {EXHIBITION.days} days: the better the walls hang together, the bigger the crowds, the
        faster on-theme work sells, and the kinder the critics.
      </p>
      <span class="label">Theme · works on your walls that fit</span>
      {!state.floor.fixtures.some((f) => f.artworkId) && <p class="hint">Your walls are bare. Hang some art first.</p>}
      <div class="theme-chips">
        {options.map(({ theme: t, syn: s }) => (
          <button class={`theme-chip ${sameTheme(t, theme) ? 'on' : ''} ${s.onTheme.length >= EXHIBITION.minWorks ? 'ready' : ''}`} onClick={() => setPick(t)}>
            {t.kind === 'solo' && <Avatar artist={state.artists[t.artistId]} size="sm" />}
            <span>{t.kind === 'solo' ? state.artists[t.artistId].name.split(' ')[0] : themeTitle(state, t)}</span>
            <i>{s.onTheme.length}</i>
          </button>
        ))}
      </div>

      <div class="show-preview">
        <h3>{themeTitle(state, theme)}</h3>
        <span class="label">
          Synergy <b class="num">{pct(syn.score)}</b>
        </span>
        <Meter value={syn.score} max={1} tone={syn.score >= 0.6 ? 'good' : syn.score < 0.3 ? 'bad' : 'accent'} />
        <Bonuses syn={syn} />
        {syn.onTheme.length > 0 && (
          <div class="show-works">
            {syn.onTheme.map((w) => (
              <ArtThumb work={w} size="sm" />
            ))}
          </div>
        )}
        {!ready && (
          <p class="hint">
            {syn.onTheme.length
              ? `Hang ${EXHIBITION.minWorks - syn.onTheme.length} more work${EXHIBITION.minWorks - syn.onTheme.length > 1 ? 's' : ''} that fit.`
              : 'Nothing on your walls fits this theme yet.'}
          </p>
        )}
      </div>

      <button
        class="btn primary wide"
        disabled={!ready || state.cash - cost < RULES.overdraftLimit}
        onClick={() => {
          if (act({ type: 'mountExhibition', theme })) toast(`“${themeTitle(state, theme)}” is open.`);
        }}
      >
        <Icon name="star" size={16} /> Open the show · {money(cost)}
      </button>

      {state.exhibitionHistory.length > 0 && (
        <>
          <span class="label">Past shows</span>
          <div class="list">
            {[...state.exhibitionHistory].reverse().map((h) => (
              <div class="list-row past-show">
                <div class="grow">
                  <b>{h.title}</b>
                  <small class="muted">
                    Days {h.startDay}–{h.endDay} · {h.visitors} visitors · {h.sales} sold
                  </small>
                </div>
                <span class="stars">{stars(h.stars)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Bonuses({ syn }: { syn: ReturnType<typeof synergy> }) {
  if (!syn.bonuses.length) return null;
  return (
    <div class="bonuses">
      {syn.bonuses.map((b) => (
        <div class={`bonus ${b.value < 0 ? 'neg' : ''}`}>
          <b>{b.label}</b>
          <small class="muted">{b.hint}</small>
          <span class="num">
            {b.value >= 0 ? '+' : ''}
            {pct(b.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
