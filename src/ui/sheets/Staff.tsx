import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ASSISTANT,
  candidatesFor,
  hired,
  incidentChance,
  STAFF,
  STAFF_ROLE_ORDER,
  STAFF_ROLES,
  salaryOf,
  weeklySalaries,
  type GameState,
  type StaffCandidate,
  type StaffRole,
} from '../../game';
import { crowdAtlas, portraitUrl } from '../../render/sprites';
import { money } from '../bits';
import { useGame } from '../context';

/** A staff member's face, in the same recolour they wear on the floor. */
function StaffFace({ c }: { c: Pick<StaffCandidate, 'sprite' | 'variant'> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!c.variant) return;
    let alive = true;
    const paint = () => {
      const src = crowdAtlas(`${c.sprite}-portrait`, c.variant);
      const cv = ref.current;
      if (!src || !cv) return false;
      cv.width = src.width;
      cv.height = src.height;
      cv.getContext('2d')!.drawImage(src, 0, 0);
      setReady(true);
      return true;
    };
    if (!paint()) {
      const id = setInterval(() => alive && paint() && clearInterval(id), 120);
      return () => {
        alive = false;
        clearInterval(id);
      };
    }
  }, [c.sprite, c.variant]);
  if (!c.variant) return <img class="portrait" src={portraitUrl(c.sprite)} alt="" />;
  return <canvas ref={ref} class="portrait" style={{ visibility: ready ? 'visible' : 'hidden' }} />;
}

const Stars = ({ n }: { n: number }) => (
  <span class="skill" aria-label={`Skill ${n} of 3`}>
    {[1, 2, 3].map((i) => (
      <i class={i <= n ? 'on' : ''} />
    ))}
  </span>
);

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** What this person would do for you, in numbers. */
function effectLine(state: GameState, c: StaffCandidate): string {
  const k = STAFF.effectBySkill[c.skill];
  switch (c.role) {
    case 'security':
      return `Stops ${pct(Math.min(0.95, 0.75 * k))} of trouble, and every theft. Risk of trouble today: ${pct(incidentChance(state))}.`;
    case 'appraiser':
      return `${pct(STAFF.appraiserDiscount * k)} off dealer prices. Floor sales ${pct(STAFF.appraiserSaleBoost * k)} likelier.`;
    case 'curator':
      return `+${Math.round(STAFF.curatorSynergy * k * 100)} show synergy. Events ${pct(STAFF.curatorEventSatisfaction * k)} more satisfying.`;
    case 'intern':
      return `Gift shop sales +${pct(STAFF.internShopBoost * k)}. Daily posts bring in visitors.`;
  }
}

function RoleCard({ role }: { role: StaffRole }) {
  const { state, act } = useGame();
  const cfg = STAFF_ROLES[role];
  const h = hired(state, role);
  const [open, setOpen] = useState(false);
  const pool = candidatesFor(role);
  return (
    <div class={`artist staff-role ${h ? 'filled' : ''}`}>
      <div class="role-head">
        <span class="label">{cfg.label}</span>
        <small class="muted">{cfg.duty}</small>
      </div>
      {h ? (
        <>
          <div class="artist-head">
            <StaffFace c={h.who} />
            <div class="grow">
              <b>{h.who.name}</b>
              <small class="muted">
                Since day {h.since} · {money(salaryOf(h.who))}/wk
              </small>
            </div>
            <Stars n={h.who.skill} />
          </div>
          <p class="bio">{h.who.blurb}</p>
          <small class="effect">{effectLine(state, h.who)}</small>
          <div class="artist-actions">
            {pool.length > 1 && (
              <button class="btn tiny" onClick={() => setOpen(!open)}>
                {open ? 'Hide others' : 'See others'}
              </button>
            )}
            <button
              class="btn tiny ghost"
              onClick={() => act({ type: 'letGoStaff', role })}
            >
              Let go
            </button>
          </div>
        </>
      ) : (
        !open && (
          <button class="btn primary wide" onClick={() => setOpen(true)}>
            Interview {pool.length === 1 ? pool[0].name.split(' ')[0] : `${pool.length} applicants`}
          </button>
        )
      )}
      {open &&
        pool
          .filter((c) => c.id !== h?.who.id)
          .map((c) => (
            <div class="applicant">
              <div class="artist-head">
                <StaffFace c={c} />
                <div class="grow">
                  <b>{c.name}</b>
                  <small class="muted">{money(salaryOf(c))} a week</small>
                </div>
                <Stars n={c.skill} />
              </div>
              <p class="bio">{c.blurb}</p>
              <small class="effect">{effectLine(state, c)}</small>
              <button
                class="btn tiny primary"
                onClick={() => {
                  if (act({ type: 'hireStaff', candidateId: c.id })) setOpen(false);
                }}
              >
                {h ? `Replace ${h.who.name.split(' ')[0]}` : 'Hire'}
              </button>
            </div>
          ))}
      {open && !h && pool.length === 1 && role === 'security' && <small class="muted">Duane is the only guard looking for work right now.</small>}
    </div>
  );
}

export function StaffList() {
  const { state } = useGame();
  const wages = weeklySalaries(state);
  return (
    <div class="artist-list">
      <p class="hint">
        Hire help to run the place. Wages are paid with the weekly bills{wages > 0 ? `: ${money(wages)} a week right now` : ''}.
      </p>
      <div class="artist staff-role filled">
        <div class="role-head">
          <span class="label">Gallery assistant</span>
          <small class="muted">Hangs new work, dusts, greets. Part of your base staff costs.</small>
        </div>
        <div class="artist-head">
          <StaffFace c={{ sprite: ASSISTANT.sprite, variant: 0 }} />
          <div class="grow">
            <b>{ASSISTANT.name}</b>
            <small class="muted">{ASSISTANT.title}</small>
          </div>
        </div>
      </div>
      {STAFF_ROLE_ORDER.map((r) => (
        <RoleCard role={r} />
      ))}
    </div>
  );
}
