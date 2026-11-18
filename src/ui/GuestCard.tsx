import { absHour, poseAt, visitTimeline } from '../game';
import { portraitUrl } from '../render/sprites';
import { RelationshipBar } from './bits';
import { useGame } from './context';
import { Icon } from './icons';
import { affinityLabel, Tastes } from './sheets/People';

const DOING: Record<string, string> = {
  walk: 'Wandering',
  idle: 'Taking it in',
  look: 'Studying',
  think: 'Not sure about',
  impressed: 'Loves',
  disapprove: 'Dislikes',
  photo: 'Photographing',
  notes: 'Taking notes on',
  chat: 'Chatting',
};

/** Floating card for a guest you tapped on the floor. */
export function GuestCard({ id }: { id: string }) {
  const { state, store, setUi } = useGame();
  const g = state.guests[id];
  const visit = state.visits.find((v) => v.guestId === id);
  if (!g) return null;

  let doing = 'Heading out';
  if (visit) {
    const pose = poseAt(visitTimeline(visit, state.floor, visit.event ? visit.end : undefined), absHour(state) + store.hourProgress);
    if (pose) {
      const step = pose.seg.step !== undefined ? visit.steps[pose.seg.step] : undefined;
      const work = step ? state.artworks[step.artworkId] : undefined;
      doing = work && pose.seg.anim !== 'walk' ? `${DOING[pose.seg.anim]} “${work.title}”` : visit.event && pose.seg.anim !== 'walk' ? 'Mingling at the party' : DOING[pose.seg.anim];
    }
  }

  return (
    <div class="inspector guest-card">
      <button class="icon-btn corner" onClick={() => setUi({ guest: null })} aria-label="Close">
        <Icon name="close" size={18} />
      </button>
      <div class="artist-head">
        <img class="portrait" src={portraitUrl(g.sprite)} alt="" />
        <div class="grow">
          <h3>{g.name}</h3>
          <small class="muted">
            {g.title} · {affinityLabel(g.affinity)}
          </small>
        </div>
      </div>
      <p class="doing">{doing}</p>
      {g.lastWords && <q class="said">{g.lastWords}</q>}
      <div class="stats">
        <span>Feels about you</span>
        <RelationshipBar value={g.affinity} />
      </div>
      <Tastes g={g} />
      <button class="btn ghost" onClick={() => setUi({ guest: null, sheet: 'people', peopleTab: 'guests' })}>
        All visitors
      </button>
    </div>
  );
}
