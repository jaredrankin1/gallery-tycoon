import { TAG_LABEL, type GameState, type Guest } from '../../game';
import { portraitUrl } from '../../render/sprites';
import { RelationshipBar, Seg, Sheet } from '../bits';
import { useGame } from '../context';
import { ArtistList } from './Artists';
import { StaffList } from './Staff';

export const affinityLabel = (a: number) =>
  a >= 60 ? 'Devoted' : a >= 30 ? 'A fan' : a >= 10 ? 'Warming up' : a > -10 ? 'Undecided' : a > -35 ? 'Unconvinced' : 'Not a fan';

const ROLE_HINT: Record<Guest['role'], string> = {
  collector: 'Buys work they love, if the price is right.',
  critic: 'Writes reviews that move your reputation.',
  influencer: 'Posts about you. Brings crowds.',
  student: 'Takes photos, spreads the word, never buys.',
  regular: 'Drops in often. Might buy something small.',
};

export const isHere = (state: GameState, id: string) => state.visits.some((v) => v.guestId === id);

/** Likes and dislikes, with the ones you haven't spotted yet hidden. */
export function Tastes({ g }: { g: Guest }) {
  const unknownLikes = g.likes.length - g.knownLikes.length;
  const unknownDislikes = g.dislikes.length - g.knownDislikes.length;
  return (
    <div class="tastes">
      <div>
        <span class="label">Loves</span>
        {g.knownLikes.map((t) => (
          <span class="tag like">{TAG_LABEL[t] ?? t}</span>
        ))}
        {Array.from({ length: Math.max(0, unknownLikes) }, () => (
          <span class="tag unknown">???</span>
        ))}
      </div>
      <div>
        <span class="label">Can't stand</span>
        {g.knownDislikes.map((t) => (
          <span class="tag dislike">{TAG_LABEL[t] ?? t}</span>
        ))}
        {Array.from({ length: Math.max(0, unknownDislikes) }, () => (
          <span class="tag unknown">???</span>
        ))}
      </div>
    </div>
  );
}

function GuestList() {
  const { state, setUi } = useGame();
  const guests = Object.values(state.guests).sort((a, b) => Number(isHere(state, b.id)) - Number(isHere(state, a.id)) || b.visits - a.visits);
  return (
    <div class="artist-list">
      <p class="hint">Watch how people react to what's on your walls. You'll learn what they love, and what they don't.</p>
      {guests.map((g) => {
        const here = isHere(state, g.id);
        const fav = g.favoriteArtworkId ? state.artworks[g.favoriteArtworkId] : undefined;
        const locked = state.reputation < g.minReputation && g.visits === 0;
        return (
          <div class={`artist guest ${locked ? 'locked' : ''}`}>
            <div class="artist-head">
              <img class="portrait" src={portraitUrl(g.sprite)} alt="" />
              <div class="grow">
                <b>{g.name}</b>
                <small class="muted">{g.title}</small>
              </div>
              {here ? (
                <button class="rel-pill good" onClick={() => setUi({ sheet: null, guest: g.id })}>
                  Here now
                </button>
              ) : (
                <span class="rel-pill">{locked ? 'Not yet' : affinityLabel(g.affinity)}</span>
              )}
            </div>
            <p class="bio">{locked ? `Won't come by until your reputation reaches ${g.minReputation}. ${ROLE_HINT[g.role]}` : g.bio}</p>
            {!locked && (
              <>
                <div class="stats">
                  <span>Feels about you</span>
                  <RelationshipBar value={g.affinity} />
                </div>
                <Tastes g={g} />
                <small class="muted">{g.role === 'student' && !g.traits.includes('photographer') ? 'Sketches what moves them, tells their classmates, never buys.' : ROLE_HINT[g.role]}</small>
                {g.visits > 0 && (
                  <small class="muted">
                    {g.visits} visit{g.visits === 1 ? '' : 's'}
                    {fav ? ` · Favourite: ${fav.title}` : ''}
                  </small>
                )}
                {g.lastWords && <q class="said">{g.lastWords}</q>}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PeopleSheet() {
  const { ui, setUi } = useGame();
  return (
    <Sheet title="People" onClose={() => setUi({ sheet: null })}>
      <Seg
        options={[
          { value: 'guests', label: 'Visitors' },
          { value: 'artists', label: 'Artists' },
          { value: 'staff', label: 'Staff' },
        ]}
        value={ui.peopleTab}
        onPick={(v) => setUi({ peopleTab: v })}
      />
      <div class="gap" />
      {ui.peopleTab === 'guests' ? <GuestList /> : ui.peopleTab === 'staff' ? <StaffList /> : <ArtistList />}
    </Sheet>
  );
}
