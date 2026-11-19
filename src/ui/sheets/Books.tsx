import { getVenueModel, MERCH_KINDS, priceDemand, shopCounter, spentThisWeek, weekday } from '../../game';
import { Meter, money, shortMoney, Sheet } from '../bits';
import { useGame } from '../context';

const step = (n: number) => (n >= 20_000 ? 5_000 : n >= 5_000 ? 1_000 : 250);

export function BooksSheet() {
  const { state, setUi, act } = useGame();
  const days = [...state.history.slice(-13), state.today];
  const max = Math.max(1, ...days.map((r) => Math.max(r.income, r.expenses)));
  const weekIncome = days.slice(-7).reduce((s, d) => s + d.income, 0);
  const weekSpend = days.slice(-7).reduce((s, d) => s + d.expenses, 0);
  const dailyVisitors = getVenueModel(state.venue).expectedDailyVisitors(state);

  const Budget = ({ label, spent, target, keyName }: { label: string; spent: number; target: number; keyName: 'art' | 'hospitality' }) => (
    <div class="budget">
      <div class="row">
        <b>{label}</b>
        <span class={spent > target ? 'bad' : 'muted'}>
          {shortMoney(spent)} of {shortMoney(target)}
        </span>
      </div>
      <Meter value={spent} max={Math.max(1, target)} tone={spent > target ? 'bad' : 'good'} />
      <div class="row">
        <small class="muted">Weekly limit (resets Monday)</small>
        <span class="stepper">
          <button class="btn round sm" onClick={() => act({ type: 'setBudget', budget: { ...state.budget, [keyName]: Math.max(0, target - step(target)) } })}>
            −
          </button>
          <button class="btn round sm" onClick={() => act({ type: 'setBudget', budget: { ...state.budget, [keyName]: target + step(target) } })}>
            +
          </button>
        </span>
      </div>
    </div>
  );

  return (
    <Sheet title="Books" onClose={() => setUi({ sheet: null })}>
      <div class="summary">
        <div>
          <small>Cash</small>
          <b class={state.cash < 0 ? 'bad' : ''}>{money(state.cash)}</b>
        </div>
        <div>
          <small>Last 7 days</small>
          <b class={weekIncome - weekSpend < 0 ? 'bad' : 'good'}>
            {weekIncome - weekSpend >= 0 ? '+' : ''}
            {shortMoney(weekIncome - weekSpend)}
          </b>
        </div>
        <div>
          <small>Visitors/day</small>
          <b>{dailyVisitors}</b>
        </div>
      </div>

      <div class="chart" role="img" aria-label="Income and spending, last 14 days">
        {days.map((r) => (
          <div class={`bar-pair ${r.day === state.day ? 'today' : ''}`}>
            <i class="in" style={{ height: `${(r.income / max) * 100}%` }} />
            <i class="out" style={{ height: `${(r.expenses / max) * 100}%` }} />
            <small>{weekday(r.day)[0]}</small>
          </div>
        ))}
      </div>
      <small class="legend">
        <i class="in" /> Income <i class="out" /> Spending
      </small>

      <h3 class="section">This week’s budget</h3>
      <Budget label="Art" spent={spentThisWeek(state, 'art')} target={state.budget.art} keyName="art" />
      <Budget label="Wine & cheese" spent={spentThisWeek(state, 'hospitality')} target={state.budget.hospitality} keyName="hospitality" />

      {state.venue === 'museum' && (
        <>
          <h3 class="section">Tickets</h3>
          <div class="budget">
            <div class="row">
              <b>Entry price</b>
              <b class="num">{money(state.settings.ticketPrice)}</b>
            </div>
            <input
              id="ticket-slider"
              type="range"
              min={0}
              max={40}
              value={state.settings.ticketPrice}
              onInput={(e) => act({ type: 'setTicketPrice', price: Number((e.target as HTMLInputElement).value) })}
            />
            <small class="muted">At this price {Math.round(priceDemand(state.settings.ticketPrice) * 100)}% of curious people come in.</small>
          </div>
        </>
      )}

      <h3 class="section">Gift shop</h3>
      <button class="list-row shop-link" onClick={() => setUi({ sheet: 'shop' })}>
        <div class="grow">
          <b>{shopCounter(state) ? `Takings today: ${money(state.shop.takingsToday)}` : 'No gift shop yet'}</b>
          <small class="muted">
            {shopCounter(state)
              ? `${MERCH_KINDS.filter((k) => state.shop.lines[k].stock === 0).length || 'Nothing'} sold out · prices and stock`
              : 'Postcards, prints, keychains and t-shirts'}
          </small>
        </div>
        <span class="muted">›</span>
      </button>

      <h3 class="section">Ledger</h3>
      <div class="ledger">
        {state.ledger
          .slice(-30)
          .reverse()
          .map((e) => (
            <div class="row">
              <small class="note">
                {weekday(e.day)} · {e.note}
              </small>
              <small class={e.amount < 0 ? 'bad' : 'good'}>{money(e.amount)}</small>
            </div>
          ))}
        {!state.ledger.length && <small class="muted">No transactions yet.</small>}
      </div>
    </Sheet>
  );
}
