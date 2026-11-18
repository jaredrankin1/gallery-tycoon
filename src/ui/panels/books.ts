import { priceDemand, spentThisWeek } from '../../game';
import { h, meter, money, shortMoney } from '../dom';
import type { PanelCtx } from './types';

export function booksPanel(ctx: PanelCtx) {
  const { state } = ctx;
  const out: Node[] = [h('div', { class: 'section-title' }, `Budget · week ${state.week}`)];

  const line = (label: string, spent: number, target: number, key: 'art' | 'hospitality') =>
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('b', {}, label), h('span', { class: spent > target ? 'bad' : '' }, `${shortMoney(spent)} / ${shortMoney(target)}`)),
      meter(spent, Math.max(1, target), spent > target ? 'bad' : 'good'),
      h('div', { class: 'row gap end' },
        h('small', { class: 'muted grow' }, 'Weekly target'),
        h('button', { class: 'btn tiny', onclick: () => ctx.act({ type: 'setBudget', budget: { ...state.budget, [key]: Math.max(0, target - step(target)) } }) }, '−'),
        h('button', { class: 'btn tiny', onclick: () => ctx.act({ type: 'setBudget', budget: { ...state.budget, [key]: target + step(target) } }) }, '+'),
      ),
    );
  out.push(
    line('Art', spentThisWeek(state, 'art'), state.budget.art, 'art'),
    line('Wine & cheese', spentThisWeek(state, 'hospitality'), state.budget.hospitality, 'hospitality'),
  );

  if (state.venue === 'museum') {
    const p = state.settings.ticketPrice;
    out.push(h('div', { class: 'card' },
      h('div', { class: 'row' }, h('b', {}, 'Ticket price'),
        h('span', { class: 'row gap' },
          h('button', { class: 'btn tiny', onclick: () => ctx.act({ type: 'setTicketPrice', price: Math.max(0, p - 1) }) }, '−'),
          h('b', {}, money(p)),
          h('button', { class: 'btn tiny', onclick: () => ctx.act({ type: 'setTicketPrice', price: p + 1 }) }, '+'))),
      h('small', { class: 'muted' }, `Demand at this price: ${Math.round(priceDemand(p) * 100)}%`),
    ));
  }

  const recent = state.reports.slice(-8);
  if (recent.length) {
    const max = Math.max(1, ...recent.map((r) => Math.max(r.income, r.expenses)));
    out.push(h('div', { class: 'section-title' }, 'Last weeks'),
      h('div', { class: 'card chart' }, ...recent.map((r) =>
        h('div', { class: 'bar-pair', title: `Week ${r.week}` },
          h('i', { class: 'in', style: `height:${(r.income / max) * 100}%` }),
          h('i', { class: 'out', style: `height:${(r.expenses / max) * 100}%` }),
          h('small', {}, `W${r.week}`)))),
      h('p', { class: 'hint' }, 'Green is income, red is spending.'));
  }

  out.push(h('div', { class: 'section-title' }, 'Ledger'));
  const entries = state.ledger.slice(-25).reverse();
  if (!entries.length) out.push(h('p', { class: 'hint' }, 'No transactions yet.'));
  out.push(h('div', { class: 'card ledger' }, ...entries.map((e) =>
    h('div', { class: 'row' }, h('small', {}, `W${e.week} · ${e.note}`), h('small', { class: e.amount < 0 ? 'bad' : 'good' }, money(e.amount))))));
  return out;
}

const step = (n: number) => (n >= 20_000 ? 5_000 : n >= 5_000 ? 1_000 : 250);
