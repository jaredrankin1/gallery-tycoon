import { useEffect, useState } from 'preact/hooks';
import { callPrice, relationshipLabel, RULES, speakerName, type ArtistCall, type TalkOption } from '../game';
import { portraitFor } from '../render/sprites';
import { ArtThumb, money } from './bits';
import { useGame } from './context';

/** The visiting artist's face, in their recolour (waits for the sheet to load). */
export function CallerFace({ call }: { call: Pick<ArtistCall, 'look'> }) {
  const [src, setSrc] = useState(() => portraitFor(call.look.sprite, call.look.variant));
  useEffect(() => {
    if (src) return;
    const t = setInterval(() => {
      const s = portraitFor(call.look.sprite, call.look.variant);
      if (s) {
        setSrc(s);
        clearInterval(t);
      }
    }, 120);
    return () => clearInterval(t);
  }, [call.look.sprite, call.look.variant, src]);
  return src ? <img src={src} alt="" /> : <span class="face-blank" />;
}

const FEEL = { 1: { mark: '♥', cls: 'up' }, 0: { mark: '…', cls: 'flat' }, [-1]: { mark: '✕', cls: 'down' } } as const;

/**
 * Talking to an artist who dropped by: their line, the work they brought, and
 * what you can say back. Shown over the floor; the game pauses while you talk.
 */
export function ArtistTalk({ onClose }: { onClose: () => void }) {
  const { state, act } = useGame();
  const call = state.artistCall;

  // Walking over is the first thing that happens.
  useEffect(() => {
    if (call?.stage === 'waiting') act({ type: 'talkToArtist' });
  }, []);
  useEffect(() => {
    if (!call || call.stage === 'done') onClose();
  }, [call?.stage]);

  if (!call || call.stage === 'waiting' || call.stage === 'done') return null;
  const artist = state.artists[call.artistId];
  const you = [...call.log].reverse().find((l) => l.who === 'you');
  const showing = call.stage === 'show' || call.stage === 'deal';
  const works = (call.stage === 'show' ? call.workIds.slice(0, 1) : call.workIds).map((id) => state.artworks[id]).filter(Boolean);
  // Five steps from frosty to glowing, so you can feel the chat going well or badly.
  const warmth = Math.max(0, Math.min(5, Math.round((call.rapport + 4) / 2)));

  const say = (o: TalkOption) => act({ type: 'talkChoose', optionId: o.id });
  const afford = (o: TalkOption) => o.tone !== 'buy' || state.cash - callPrice(state, call, o.workIds ?? []) >= RULES.overdraftLimit;

  return (
    <div class="talk" role="dialog" aria-label={`Talking with ${speakerName(artist)}`}>
      <div class="talk-card" key={call.stage}>
        <div class="speaker">
          <CallerFace call={call} />
          <div>
            <b>{speakerName(artist)}</b>
            <small class="muted">
              {call.stage === 'farewell' ? relationshipLabel(artist.relationship) : artist.medium} · {artist.style}
            </small>
          </div>
          <span class="warmth" title="How it’s going" aria-label={`Rapport ${warmth} of 5`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <i class={i < warmth ? 'on' : ''} />
            ))}
          </span>
        </div>

        {you && (
          <p class={`you-said ${FEEL[you.feel ?? 0].cls}`}>
            <i aria-hidden="true">{FEEL[you.feel ?? 0].mark}</i>
            <span>“{you.text}”</span>
          </p>
        )}

        <p class="line">{call.line}</p>

        {showing && works.length > 0 && (
          <div class={`talk-works n${works.length}`}>
            {works.map((w) => (
              <div class="talk-work">
                <ArtThumb work={w} size="lg" />
                <b class="clamp">“{w.title}”</b>
                {call.stage === 'deal' && <small class="muted">Worth {money(w.value)}</small>}
              </div>
            ))}
          </div>
        )}

        {call.stage === 'farewell' && call.result && (
          <div class="talk-result">
            <span class={call.result.relationship >= 0 ? 'good' : 'bad'}>
              Relationship {call.result.relationship >= 0 ? '+' : ''}
              {call.result.relationship}
            </span>
            {call.result.reputation !== 0 && (
              <span class={call.result.reputation > 0 ? 'good' : 'bad'}>
                Reputation {call.result.reputation > 0 ? '+' : ''}
                {call.result.reputation}
              </span>
            )}
            {call.bought.length > 0 && <span>Bought {call.bought.length === 1 ? 'one piece' : 'both'}</span>}
          </div>
        )}

        <div class="replies">
          {call.options.map((o) => (
            <button class={`reply ${o.tone === 'buy' ? 'buy' : ''}`} disabled={!afford(o)} onClick={() => say(o)}>
              {o.text}
              {!afford(o) && <small>Not enough cash</small>}
            </button>
          ))}
        </div>

        {call.stage !== 'farewell' && (
          <button class="back-link" onClick={() => act({ type: 'leaveTalk' })}>
            Walk away
          </button>
        )}
      </div>
    </div>
  );
}
