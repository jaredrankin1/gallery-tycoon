import { ASSISTANT, EVENT_KIND, weekday, type FeedItem } from '../../game';
import { portraitUrl } from '../../render/sprites';
import { Sheet } from '../bits';
import { useGame, type Ui } from '../context';
import { Icon } from '../icons';

interface Todo {
  key: string;
  icon: string;
  tone: 'red' | 'yellow' | 'blue';
  title: string;
  note: string;
  cta: string;
  go: () => void;
  primary?: boolean;
}

const FEED_ICON: Partial<Record<FeedItem['kind'], string>> = {
  sale: 'art',
  tickets: 'people',
  shop: 'books',
  event: 'events',
  review: 'star',
  guest: 'artists',
  delivery: 'art',
  warn: 'close',
  bills: 'books',
};

/**
 * Everything that happened, and everything waiting on you, in one place: visiting artists,
 * the auction, works in storage, empty shelves, reviews, sales and bills.
 */
export function InboxSheet({ onTalk }: { onTalk: () => void }) {
  const { state, setUi } = useGame();
  const open = (patch: Partial<Ui>) => setUi({ guest: null, selected: null, ...patch });

  const todos: Todo[] = [];
  const call = state.artistCall && state.artistCall.stage !== 'done' ? state.artistCall : null;
  if (call) {
    const a = state.artists[call.artistId];
    todos.push({ key: 'call', icon: 'artists', tone: 'blue', title: `${a?.name.split(' ')[0] ?? 'An artist'} is here with new work`, note: 'The clock stops while you talk', cta: 'Talk', go: onTalk, primary: true });
  }
  const tonight = state.events.find((e) => e.day === state.day);
  if (tonight) todos.push({ key: 'tonight', icon: 'events', tone: 'red', title: `${EVENT_KIND[tonight.kind].label} tonight`, note: `${tonight.hospitality.guests} guests invited`, cta: 'See', go: () => open({ sheet: 'calendar' }) });
  const sale = state.auction && state.auction.day >= state.day ? state.auction : null;
  if (sale) {
    const live = sale.day === state.day;
    todos.push({ key: 'auction', icon: 'art', tone: 'yellow', title: live ? `Auction today · ${sale.lots.length} lots` : `Auction ${weekday(sale.day)} · ${sale.lots.length} lots`, note: live ? 'Bidding closes at midnight' : sale.house, cta: live ? 'Bid' : 'Preview', go: () => open({ sheet: 'collection', artTab: 'auction' }), primary: live });
  }
  const stored = Object.values(state.artworks).filter((w) => w.status === 'storage').length;
  if (stored && !state.staff?.autoHang) todos.push({ key: 'storage', icon: 'art', tone: 'yellow', title: `${stored} work${stored === 1 ? '' : 's'} in storage`, note: 'Art sells from the walls, not the back room', cta: 'Hang', go: () => open({ sheet: 'collection', artTab: 'owned' }) });
  const empty = state.shop && state.floor.fixtures.some((f) => f.kind === 'shop') ? Object.values(state.shop.lines).filter((l) => l.stock === 0).length : 0;
  if (empty && !state.shop.autoRestock) todos.push({ key: 'shop', icon: 'books', tone: 'red', title: 'Gift shop shelves are empty', note: `${empty} line${empty === 1 ? '' : 's'} sold out`, cta: 'Restock', go: () => open({ sheet: 'shop' }) });
  if (!state.exhibition && state.floor.fixtures.filter((f) => f.artworkId).length >= 3 && state.day > 1)
    todos.push({ key: 'show', icon: 'calendar', tone: 'blue', title: 'No show on', note: 'A themed show brings crowds and critics', cta: 'Plan', go: () => open({ sheet: 'calendar' }) });
  if (state.cash < 0) todos.push({ key: 'cash', icon: 'books', tone: 'red', title: 'You’re overdrawn', note: 'Sell something or cut spending', cta: 'Books', go: () => open({ sheet: 'books' }) });

  const news = state.feed.filter((f) => !f.quiet).slice(-30).reverse();
  const dayLabel = (d: number) => (d === state.day ? 'Today' : d === state.day - 1 ? 'Yesterday' : `${weekday(d)} · day ${d}`);

  return (
    <Sheet title="Inbox" onClose={() => setUi({ sheet: null })}>
      <h3 class="section">Needs you</h3>
      {!todos.length && <p class="hint">Nothing waiting on you. {ASSISTANT.name} has the floor.</p>}
      <div class="list">
        {todos.map((t) => (
          <div class="list-row todo">
            <span class={`todo-icon ${t.tone}`}>
              <Icon name={t.icon} size={18} />
            </span>
            <div class="grow">
              <b>{t.title}</b>
              <small class="muted">{t.note}</small>
            </div>
            <button class={`btn tiny ${t.primary ? 'primary' : ''}`} onClick={t.go}>
              {t.cta}
            </button>
          </div>
        ))}
      </div>

      <h3 class="section">Your people</h3>
      <div class="people-links">
        <button class="btn" onClick={() => open({ sheet: 'people', peopleTab: 'guests' })}>
          <Icon name="people" size={16} /> Visitors
        </button>
        <button class="btn" onClick={() => open({ sheet: 'people', peopleTab: 'artists' })}>
          <Icon name="artists" size={16} /> Artists
        </button>
        <button class="btn" onClick={() => open({ sheet: 'people', peopleTab: 'staff' })}>
          <Icon name="build" size={16} /> Staff
        </button>
      </div>

      <h3 class="section">News</h3>
      {!news.length && <p class="hint">Sales, reviews and visitors will show up here.</p>}
      <div class="news">
        {news.map((f, i) => {
          const face = f.face ?? (f.guestId ? state.guests[f.guestId]?.sprite : undefined);
          return (
            <>
              {(i === 0 || news[i - 1].day !== f.day) && <span class="news-day">{dayLabel(f.day)}</span>}
              <div class={`news-row ${f.kind}`}>
                {face ? <img src={portraitUrl(face)} alt="" /> : <Icon name={FEED_ICON[f.kind] ?? 'star'} size={14} />}
                <span>{f.text}</span>
              </div>
            </>
          );
        })}
      </div>
    </Sheet>
  );
}
