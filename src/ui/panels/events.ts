import {
  EVENT_KIND,
  TIER_LABEL,
  eventCost,
  expectedAttendance,
  type EventKind,
  type HospitalityTier,
} from '../../game';
import { h, money, segmented } from '../dom';
import type { PanelCtx } from './types';

const TIERS = [0, 1, 2, 3] as HospitalityTier[];

export function eventsPanel(ctx: PanelCtx) {
  const { state, ui } = ctx;
  const out: Node[] = [h('div', { class: 'section-title' }, 'Upcoming')];

  if (!state.events.length) out.push(h('p', { class: 'hint' }, 'Nothing booked. Openings sell art and win artists over.'));
  for (const e of state.events) {
    out.push(h('div', { class: 'card row' },
      h('div', {}, h('b', {}, `${EVENT_KIND[e.kind].label} · week ${e.week}`),
        h('small', {}, e.featuredArtistIds.map((id) => state.artists[id].name).join(', ') || 'No featured artist'),
        h('small', { class: 'muted' }, `Wine: ${TIER_LABEL[e.hospitality.wine]} · Cheese: ${TIER_LABEL[e.hospitality.cheese]} · ${e.hospitality.guests} guests`)),
      h('button', { class: 'btn tiny ghost', onclick: () => ctx.act({ type: 'cancelEvent', eventId: e.id }) }, 'Cancel'),
    ));
  }

  if (!ui.draft) {
    out.push(h('button', {
      class: 'btn primary wide',
      onclick: () => {
        ui.draft = { kind: 'opening', week: state.week + 1, featured: [], hospitality: { wine: 1, cheese: 1, guests: 50 } };
        ctx.refresh();
      },
    }, 'Plan an event'));
    return out;
  }

  const d = ui.draft;
  const cfg = EVENT_KIND[d.kind];
  const set = (fn: () => void) => () => { fn(); ctx.refresh(); };
  const est = expectedAttendance(state, d.kind, d.featured);
  const cost = eventCost(d.kind, d.hospitality);
  const weeks = Array.from({ length: 6 }, (_, i) => state.week + cfg.minWeeksAhead + i);
  if (d.week < weeks[0]) d.week = weeks[0];

  out.push(h('div', { class: 'card planner' },
    h('b', {}, 'Plan an event'),
    h('div', { class: 'label' }, 'Type'),
    segmented((Object.keys(EVENT_KIND) as EventKind[]).map((k) => ({ value: k, label: EVENT_KIND[k].short })), d.kind,
      (k) => set(() => { d.kind = k; d.featured = d.featured.slice(0, EVENT_KIND[k].maxFeatured); })()),
    h('div', { class: 'label' }, 'Week'),
    segmented(weeks.map((w) => ({ value: w, label: `W${w}` })), d.week, (w) => set(() => (d.week = w))()),
    h('div', { class: 'label' }, cfg.minFeatured === cfg.maxFeatured ? `Featuring ${cfg.minFeatured} artist` : `Featuring ${cfg.minFeatured}–${cfg.maxFeatured} artists`),
    h('div', { class: 'chips' }, ...Object.values(state.artists).map((a) => {
      const on = d.featured.includes(a.id);
      return h('button', {
        class: `chip ${on ? 'on' : ''}`,
        disabled: a.relationship < 0,
        onclick: set(() => {
          if (on) d.featured = d.featured.filter((x) => x !== a.id);
          else if (cfg.maxFeatured === 1) d.featured = [a.id];
          else if (d.featured.length < cfg.maxFeatured) d.featured = [...d.featured, a.id];
        }),
      }, a.name.split(' ')[0]);
    })),
    h('div', { class: 'label' }, 'Wine'),
    segmented(TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] })), d.hospitality.wine, (t) => set(() => (d.hospitality.wine = t))()),
    h('div', { class: 'label' }, 'Cheese'),
    segmented(TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] })), d.hospitality.cheese, (t) => set(() => (d.hospitality.cheese = t))()),
    h('div', { class: 'row' },
      h('span', { class: 'label' }, 'Cater for'),
      h('span', { class: 'row gap' },
        h('button', { class: 'btn tiny', onclick: set(() => (d.hospitality.guests = Math.max(0, d.hospitality.guests - 10))) }, '−10'),
        h('b', {}, `${d.hospitality.guests}`),
        h('button', { class: 'btn tiny', onclick: set(() => (d.hospitality.guests += 10)) }, '+10'),
      ),
    ),
    h('small', { class: 'muted' }, `Expect about ${est} guests.`),
    h('div', { class: 'costs' },
      h('div', { class: 'row' }, h('span', {}, 'Booking'), h('span', {}, money(cost.base))),
      h('div', { class: 'row' }, h('span', {}, 'Wine & cheese'), h('span', {}, money(cost.hospitality))),
      h('div', { class: 'row total' }, h('span', {}, 'Total'), h('b', {}, money(cost.total))),
    ),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn ghost', onclick: set(() => (ui.draft = null)) }, 'Cancel'),
      h('button', {
        class: 'btn primary grow',
        onclick: () => {
          if (ctx.act({ type: 'scheduleEvent', kind: d.kind, week: d.week, featuredArtistIds: d.featured, hospitality: { ...d.hospitality } })) {
            ui.draft = null;
            ctx.refresh();
          }
        },
      }, 'Book it'),
    ),
  ));
  return out;
}
