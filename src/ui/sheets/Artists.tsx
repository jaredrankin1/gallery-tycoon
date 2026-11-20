import { useState } from 'preact/hooks';
import {
  atRisk,
  canSponsor,
  careerStage,
  CAREER,
  EVENT_KIND,
  isScouted,
  PATRONAGE,
  patronCount,
  potentialStars,
  relationshipLabel,
  RULES,
  signedWithRival,
  stipendFor,
  TAG_LABEL,
  type Artist,
  type StipendTier,
} from '../../game';
import { Avatar, Meter, money, RelationshipBar } from '../bits';
import { useGame } from '../context';
import { Icon } from '../icons';

const TRAIT_LABEL: Record<string, string> = {
  'loves-wine': 'Loves wine',
  'cheese-snob': 'Cheese snob',
  social: 'Social',
  reclusive: 'Reclusive',
  trendy: 'Trendy',
  easygoing: 'Easygoing',
  diva: 'Diva',
};

const TIERS: StipendTier[] = ['modest', 'fair', 'generous'];

const formLabel = (f: number) => (f >= 70 ? 'On fire' : f >= 55 ? 'In form' : f >= 40 ? 'Steady' : f >= 25 ? 'Struggling' : 'Blocked');

/** The artist cards, shown under People → Artists. */
export function ArtistList() {
  const { state } = useGame();
  const artists = Object.values(state.artists).sort((a, b) => Number(!!b.patron) - Number(!!a.patron));
  const used = patronCount(state);

  return (
    <div class="artist-list">
      <p class="hint">
        Sponsor up to {PATRONAGE.slots} artists ({used} now). They send you new work, and their careers lift what you own. Studio visits reveal who’s
        going places.
      </p>
      {artists.map((a) => (
        <ArtistCard a={a} />
      ))}
    </div>
  );
}

function ArtistCard({ a }: { a: Artist }) {
  const { state, setUi, act, toast } = useGame();
  const [picking, setPicking] = useState(false);
  const owned = Object.values(state.artworks).filter((w) => w.artistId === a.id && (w.status === 'storage' || w.status === 'display')).length;
  const seenToday = a.lastVisitDay === state.day;
  const quiet = state.day - a.lastContactDay;
  const trend = a.fame - a.fameLastWeek;
  const first = a.name.split(' ')[0];
  const sponsorBlock = canSponsor(state, a);
  const rival = signedWithRival(state, a);

  return (
    <div class={`artist ${a.patron ? 'sponsored' : ''}`}>
      <div class="artist-head">
        <Avatar artist={a} size="lg" />
        <div class="grow">
          <b>{a.name}</b>
          <small class="muted">
            {a.medium} · {a.style}
          </small>
        </div>
        <span class={`rel-pill ${a.relationship >= 35 ? 'good' : a.relationship < -10 ? 'bad' : ''}`}>{relationshipLabel(a.relationship)}</span>
      </div>
      <p class="bio">{a.bio}</p>
      <div class="stats">
        <span>Relationship</span>
        <RelationshipBar value={a.relationship} />
        <span>Fame</span>
        <span class="fame-row">
          <Meter value={a.fame} />
          <small class={`trend ${trend > 0.5 ? 'up' : trend < -0.5 ? 'down' : ''}`}>
            {careerStage(a.fame)} {trend > 0.5 ? '▲' : trend < -0.5 ? '▼' : ''}
          </small>
        </span>
        <span>Potential</span>
        {isScouted(a) ? (
          <span class="stars" title="Where their career could go">
            {'★'.repeat(potentialStars(a.potential))}
            <i>{'★'.repeat(5 - potentialStars(a.potential))}</i>
          </span>
        ) : (
          <small class="muted">
            ? · {CAREER.visitsToScout - a.studioVisits} more studio visit{CAREER.visitsToScout - a.studioVisits > 1 ? 's' : ''} to tell
          </small>
        )}
      </div>
      <div class="tags">
        {a.traits.map((t) => (
          <span class="tag">{TRAIT_LABEL[t] ?? t}</span>
        ))}
        {a.phase && <span class="tag phase">Phase: {TAG_LABEL[a.phase] ?? a.phase}</span>}
        {owned > 0 && <span class="tag gold">{owned} in your collection</span>}
        {quiet > RULES.neglectAfterDays && a.relationship > 0 && <span class="tag warn">Feeling ignored</span>}
        {rival && <span class="tag warn">With a rival until day {a.rivalUntil}</span>}
      </div>

      {a.patron && (
        <div class={`patron ${a.patron.courtedDay !== undefined ? 'courted' : ''}`}>
          <div class="patron-head">
            <Icon name="star" size={14} />
            <b>Your artist</b>
            <small class="muted">
              {money(a.patron.stipend)}/wk · {a.patron.delivered} delivered · {formLabel(a.form)}
            </small>
          </div>
          {a.patron.courtedDay !== undefined && (
            <p class="warn-line">
              {a.patron.courtedBy} is courting {first}.{' '}
              {atRisk(a) ? `Pay at least Fair and get to Friend (${PATRONAGE.loyalAt}+) before Sunday.` : 'They’re staying put for now.'}
            </p>
          )}
          {a.patron.courtedDay === undefined && atRisk(a) && a.fame >= PATRONAGE.rivalMinFame && (
            <p class="warn-line soft">Underpaid or unhappy artists get offers from rival galleries.</p>
          )}
          <StipendPicker
            a={a}
            value={a.patron.tier}
            onPick={(tier) => {
              if (tier !== a.patron!.tier && act({ type: 'setStipend', artistId: a.id, tier })) toast(`${first}’s stipend is now ${money(stipendFor(a, tier))} a week.`);
            }}
          />
          <button
            class="btn tiny ghost"
            onClick={() => {
              if (act({ type: 'endPatronage', artistId: a.id })) toast(`You stopped sponsoring ${first}.`);
            }}
          >
            End sponsorship
          </button>
        </div>
      )}

      {!a.patron && picking && (
        <div class="patron">
          <div class="patron-head">
            <b>Sponsor {first}</b>
            <small class="muted">First week paid now, then weekly with the bills.</small>
          </div>
          <StipendPicker
            a={a}
            value={null}
            onPick={(tier) => {
              if (act({ type: 'signPatron', artistId: a.id, tier })) setPicking(false);
            }}
          />
          <button class="btn tiny ghost" onClick={() => setPicking(false)}>
            Not now
          </button>
        </div>
      )}

      <div class="artist-actions">
        <button
          class="btn ghost"
          disabled={seenToday}
          onClick={() => {
            if (act({ type: 'studioVisit', artistId: a.id })) {
              const s = state.artists[a.id];
              toast(
                s.studioVisits + 1 >= CAREER.visitsToScout && s.studioVisits < CAREER.visitsToScout
                  ? `You’ve got the measure of ${first} now. Check their potential.`
                  : `Spent the afternoon in ${first}’s studio.`,
              );
            }
          }}
        >
          {seenToday ? 'Visited today' : `Studio visit · ${money(RULES.studioVisitCost)}`}
        </button>
        <button
            class="btn"
            disabled={a.relationship < 0}
            onClick={() =>
              setUi({
                sheet: 'events',
                eventsTab: 'events',
                draft: {
                  kind: 'opening',
                  day: state.day + EVENT_KIND.opening.minDaysAhead,
                  featured: [a.id],
                  hospitality: { wine: 2, cheese: 2, guests: 50 },
                },
              })
            }
          >
            <Icon name="events" size={16} /> Give a show
          </button>
      </div>
      {!a.patron && !picking && (
        <button class="btn primary wide sponsor-btn" disabled={!!sponsorBlock} onClick={() => setPicking(true)}>
          <Icon name="star" size={16} /> Sponsor {first} · from {money(stipendFor(a, 'modest'))}/wk
        </button>
      )}
      {sponsorBlock && !a.patron && !rival && <small class="muted why">{sponsorBlock}</small>}
    </div>
  );
}

function StipendPicker({ a, value, onPick }: { a: Artist; value: StipendTier | null; onPick: (t: StipendTier) => void }) {
  return (
    <div class="stipends">
      {TIERS.map((t) => (
        <button class={value === t ? 'on' : ''} onClick={() => onPick(t)}>
          <b>{PATRONAGE.tiers[t].label}</b>
          <small>{money(stipendFor(a, t))}/wk</small>
          <i>{t === 'modest' ? 'Slower, riskier' : t === 'fair' ? 'Steady work' : 'Best work, loyal'}</i>
        </button>
      ))}
    </div>
  );
}
