import { absHour, MOOD_AXES, MOOD_POLES, moodAt, moodWord, poseAt, visitTimeline, type GuestVisit, type Mood } from '../game';
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

const LEAVING: Record<NonNullable<GuestVisit['leftEarly']>, string> = {
  bored: 'Bored. Leaving early',
  crowded: 'Fed up with the crowds. Leaving early',
  unhappy: 'Not enjoying this. Leaving early',
};

/** Five two-ended bars: sad…happy, bored…amused, and so on. */
function MoodBars({ mood }: { mood: Mood }) {
  return (
    <div class="moods">
      {MOOD_AXES.map((k) => {
        const v = mood[k];
        const [lo, hi] = MOOD_POLES[k];
        const pct = Math.min(50, Math.abs(v) * 50);
        return (
          <>
            <span class={v < -0.15 ? 'on' : ''}>{lo}</span>
            <span class="relbar">
              <i class={v < 0 ? 'neg' : 'pos'} style={v < 0 ? { right: '50%', width: `${pct}%` } : { left: '50%', width: `${pct}%` }} />
            </span>
            <span class={v > 0.15 ? 'on' : ''}>{hi}</span>
          </>
        );
      })}
    </div>
  );
}

/** Floating card for a guest you tapped on the floor. */
export function GuestCard({ id }: { id: string }) {
  const { state, store, setUi } = useGame();
  const g = state.guests[id];
  const visit = state.visits.find((v) => v.guestId === id);
  if (!g && !visit) return null;

  let doing = 'Heading out';
  let mood: Mood | null = null;
  if (visit) {
    const segs = visitTimeline(visit, state.floor);
    const now = absHour(state) + store.hourProgress;
    const pose = poseAt(segs, now);
    if (visit.mood) mood = moodAt(visit, segs, now);
    if (pose) {
      const step = pose.seg.step !== undefined ? visit.steps[pose.seg.step] : undefined;
      const work = step ? state.artworks[step.artworkId] : undefined;
      const lastSeg = segs.findIndex((g) => g === pose.seg);
      const outbound = lastSeg >= 0 && segs.slice(lastSeg).every((g) => g.anim === 'walk');
      doing =
        outbound && visit.leftEarly
          ? LEAVING[visit.leftEarly]
          : outbound
            ? 'Heading out'
            : work && pose.seg.anim !== 'walk'
              ? `${DOING[pose.seg.anim]} “${work.title}”`
              : visit.event && pose.seg.anim !== 'walk'
                ? 'Mingling at the party'
                : DOING[pose.seg.anim];
    }
  }

  if (!g)
    return (
      <div class="inspector guest-card">
        <button class="icon-btn corner" onClick={() => setUi({ guest: null })} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
        <h3>{visit?.name ?? 'A visitor'}</h3>
        <small class="muted">
          Visitor{mood ? ` · ${moodWord(mood)}` : ''} · {visit?.event ? 'here for tonight’s party' : `one of ${state.today.visitors} today`}
        </small>
        <p class="doing">{doing}</p>
        {mood && <MoodBars mood={mood} />}
      </div>
    );

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
      {mood && <MoodBars mood={mood} />}
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
