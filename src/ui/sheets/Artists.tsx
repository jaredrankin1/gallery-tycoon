import { EVENT_KIND, relationshipLabel, RULES } from '../../game';
import { Avatar, Meter, money, RelationshipBar, Sheet } from '../bits';
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

export function ArtistsSheet() {
  const { state, setUi, act, toast } = useGame();
  const artists = Object.values(state.artists);

  return (
    <Sheet title="Artists" onClose={() => setUi({ sheet: null })}>
      <div class="artist-list">
        {artists.map((a) => {
          const owned = Object.values(state.artworks).filter((w) => w.artistId === a.id && (w.status === 'storage' || w.status === 'display')).length;
          const seenToday = a.lastVisitDay === state.day;
          const quiet = state.day - a.lastContactDay;
          return (
            <div class="artist">
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
                <Meter value={a.fame} />
              </div>
              <div class="tags">
                {a.traits.map((t) => (
                  <span class="tag">{TRAIT_LABEL[t] ?? t}</span>
                ))}
                {owned > 0 && <span class="tag gold">{owned} in your collection</span>}
                {quiet > RULES.neglectAfterDays && a.relationship > 0 && <span class="tag warn">Feeling ignored</span>}
              </div>
              <div class="artist-actions">
                <button
                  class="btn ghost"
                  disabled={seenToday}
                  onClick={() => {
                    if (act({ type: 'studioVisit', artistId: a.id })) toast(`Spent the afternoon in ${a.name.split(' ')[0]}’s studio.`);
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
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
