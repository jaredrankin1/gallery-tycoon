import {
  CHEESE_PER_GUEST,
  EVENT_KIND,
  eventCost,
  expectedAttendance,
  TIER_LABEL,
  weekday,
  WINE_PER_GUEST,
  type EventKind,
  type HospitalityTier,
} from '../../game';
import { Avatar, money, Seg, Sheet } from '../bits';
import { ExhibitionPanel } from './Exhibition';
import { useGame, type EventDraft } from '../context';
import { Icon } from '../icons';

const TIERS: HospitalityTier[] = [0, 1, 2, 3];

export function EventsSheet() {
  const { state, ui, setUi, act } = useGame();
  const d = ui.draft;

  const startDraft = () =>
    setUi({ draft: { kind: 'opening', day: state.day + EVENT_KIND.opening.minDaysAhead, featured: [], hospitality: { wine: 2, cheese: 2, guests: 50 } } });

  if (d) return <Planner draft={d} />;

  const tabs = (
    <Seg
      options={[
        { value: 'show', label: state.exhibition ? 'Exhibition · on' : 'Exhibition' },
        { value: 'events', label: `Events (${state.events.length})` },
      ]}
      value={ui.eventsTab}
      onPick={(v) => setUi({ eventsTab: v })}
    />
  );

  if (ui.eventsTab === 'show') {
    return (
      <Sheet title="Shows & events" onClose={() => setUi({ sheet: null })}>
        {tabs}
        <ExhibitionPanel />
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Shows & events"
      onClose={() => setUi({ sheet: null })}
      footer={
        <button class="btn primary wide" onClick={startDraft}>
          <Icon name="plus" size={16} /> Plan an event
        </button>
      }
    >
      {tabs}
      {!state.events.length && (
        <div class="empty">
          <Icon name="events" size={36} />
          <p>Nothing booked. Openings sell art and win artists over. Galas make your name.</p>
        </div>
      )}
      <div class="list">
        {state.events.map((e) => {
          const inDays = e.day - state.day;
          return (
            <div class="ticket">
              <div class="ticket-date">
                <small>{weekday(e.day)}</small>
                <b>{inDays === 0 ? 'Tonight' : inDays === 1 ? 'Tmrw' : `${inDays}d`}</b>
              </div>
              <div class="grow">
                <b>{EVENT_KIND[e.kind].label}</b>
                <span class="faces">
                  {e.featuredArtistIds.map((id) => (
                    <Avatar artist={state.artists[id]} size="sm" />
                  ))}
                  <small class="muted">{e.featuredArtistIds.map((id) => state.artists[id].name.split(' ')[0]).join(', ') || 'No featured artist'}</small>
                </span>
                <small class="muted">
                  {TIER_LABEL[e.hospitality.wine]} wine · {TIER_LABEL[e.hospitality.cheese]} cheese · {e.hospitality.guests} guests
                </small>
              </div>
              <button class="btn tiny ghost" onClick={() => act({ type: 'cancelEvent', eventId: e.id })}>
                Cancel
              </button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

function Planner({ draft: d }: { draft: EventDraft }) {
  const { state, setUi, act, toast } = useGame();
  const cfg = EVENT_KIND[d.kind];
  const set = (patch: Partial<EventDraft>) => setUi({ draft: { ...d, ...patch } });
  const setH = (patch: Partial<EventDraft['hospitality']>) => set({ hospitality: { ...d.hospitality, ...patch } });

  const days = Array.from({ length: 7 }, (_, i) => state.day + cfg.minDaysAhead + i);
  const day = d.day < days[0] ? days[0] : d.day;
  const booked = new Set(state.events.map((e) => e.day));
  const est = expectedAttendance(state, d.kind, d.featured);
  const cost = eventCost(d.kind, d.hospitality);
  const featuredOk = d.featured.length >= cfg.minFeatured && d.featured.length <= cfg.maxFeatured;
  const perHead = WINE_PER_GUEST[d.hospitality.wine] + CHEESE_PER_GUEST[d.hospitality.cheese];
  const short = d.hospitality.guests < est * 0.85 && perHead > 0;

  const toggleArtist = (id: string) => {
    const on = d.featured.includes(id);
    if (on) set({ featured: d.featured.filter((x) => x !== id) });
    else if (cfg.maxFeatured === 1) set({ featured: [id] });
    else if (d.featured.length < cfg.maxFeatured) set({ featured: [...d.featured, id] });
    else toast(`A ${cfg.label.toLowerCase()} features up to ${cfg.maxFeatured} artists.`, 'error');
  };

  const book = () => {
    if (act({ type: 'scheduleEvent', kind: d.kind, day, featuredArtistIds: d.featured, hospitality: d.hospitality })) {
      setUi({ draft: null });
      toast(`${cfg.label} booked for ${weekday(day)}.`);
    }
  };

  return (
    <Sheet
      title="Plan an event"
      onClose={() => setUi({ draft: null })}
      footer={
        <div class="book-bar">
          <div>
            <small class="muted">
              Venue {money(cost.base)} + food & drink {money(cost.hospitality)}
            </small>
            <b>{money(cost.total)}</b>
          </div>
          <button class="btn primary" disabled={!featuredOk} onClick={book}>
            Book it
          </button>
        </div>
      }
    >
      <div class="kinds">
        {(Object.keys(EVENT_KIND) as EventKind[]).map((k) => (
          <button
            class={`kind ${d.kind === k ? 'on' : ''}`}
            onClick={() => set({ kind: k, featured: d.featured.slice(0, EVENT_KIND[k].maxFeatured), day: Math.max(d.day, state.day + EVENT_KIND[k].minDaysAhead) })}
          >
            <b>{EVENT_KIND[k].short}</b>
            <small>{money(EVENT_KIND[k].baseCost)}</small>
          </button>
        ))}
      </div>

      <span class="label">When</span>
      <div class="days">
        {days.map((dd) => (
          <button class={`day ${day === dd ? 'on' : ''}`} disabled={booked.has(dd)} onClick={() => set({ day: dd })}>
            <small>{weekday(dd)}</small>
            <b>{dd}</b>
          </button>
        ))}
      </div>

      <span class="label">
        Featuring {cfg.minFeatured === cfg.maxFeatured ? `${cfg.minFeatured} artist` : `${cfg.minFeatured}–${cfg.maxFeatured} artists`}
      </span>
      <div class="faces-pick">
        {Object.values(state.artists).map((a) => (
          <button class={`face ${d.featured.includes(a.id) ? 'on' : ''}`} disabled={a.relationship < 0} onClick={() => toggleArtist(a.id)}>
            <Avatar artist={a} />
            <small>{a.name.split(' ')[0]}</small>
          </button>
        ))}
      </div>

      <div class="hosp">
        <TierPicker icon="wine" label="Wine" value={d.hospitality.wine} perGuest={WINE_PER_GUEST} onPick={(t) => setH({ wine: t })} />
        <TierPicker icon="cheese" label="Cheese" value={d.hospitality.cheese} perGuest={CHEESE_PER_GUEST} onPick={(t) => setH({ cheese: t })} />
      </div>

      <span class="label">
        Cater for <b class="num">{d.hospitality.guests}</b> guests
      </span>
      <div class="slider-wrap">
        <input
          id="guest-slider"
          type="range"
          min={0}
          max={300}
          step={5}
          value={d.hospitality.guests}
          onInput={(e) => setH({ guests: Number((e.target as HTMLInputElement).value) })}
        />
        <span class="expect" style={{ left: `${Math.min(100, (est / 300) * 100)}%` }} title="Expected turnout" />
      </div>
      <small class={short ? 'bad' : 'muted'}>
        About {est} people will come.{short ? ' Food and wine will run out.' : ''}
      </small>
    </Sheet>
  );
}

function TierPicker({
  icon,
  label,
  value,
  perGuest,
  onPick,
}: {
  icon: string;
  label: string;
  value: HospitalityTier;
  perGuest: Record<HospitalityTier, number>;
  onPick: (t: HospitalityTier) => void;
}) {
  return (
    <div class="tier">
      <span class="tier-head">
        <Icon name={icon} size={18} />
        <b>{label}</b>
        <small class="muted">{perGuest[value] ? `${money(perGuest[value])}/guest` : 'none'}</small>
      </span>
      <div class="tier-steps">
        {TIERS.map((t) => (
          <button class={value === t ? 'on' : ''} onClick={() => onPick(t)} aria-label={TIER_LABEL[t]}>
            <span class="pips">{t === 0 ? '–' : Array.from({ length: t }, () => '●').join('')}</span>
            <small>{TIER_LABEL[t]}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
