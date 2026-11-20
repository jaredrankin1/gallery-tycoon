// Shared little pieces: formatting, art thumbnails, artist avatars, meters.
import type { ComponentChildren } from 'preact';
import { relationshipLabel, type Artist, type Artwork } from '../game';
import { hueOf } from '../render/iso';
import { paintingUrl } from '../render/paintings';
import { Icon } from './icons';

export const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

export const shortMoney = (n: number) => {
  const a = Math.abs(n);
  const s =
    a >= 1_000_000 ? `${(a / 1_000_000).toFixed(2)}M` : a >= 10_000 ? `${(a / 1000).toFixed(1)}k` : Math.round(a).toLocaleString('en-US');
  return (n < 0 ? '-$' : '$') + s;
};

/** Procedural painting thumbnail that matches what hangs on the floor. */
export function ArtThumb({ work, size = 'md' }: { work: Pick<Artwork, 'id' | 'image' | 'form'>; size?: 'sm' | 'md' | 'lg' }) {
  const src = work.image && paintingUrl(work.image);
  if (src)
    return (
      <span class={`thumb ${size} img${work.form && work.form !== 'painting' ? ' obj' : ''}`}>
        <img src={src} alt="" loading="lazy" />
      </span>
    );
  const h = hueOf(work.id);
  return (
    <span class={`thumb ${size}`} style={{ '--h': h, '--h2': (h + 140) % 360 }}>
      <i />
    </span>
  );
}

export function Avatar({ artist, size = 'md' }: { artist: Artist; size?: 'sm' | 'md' | 'lg' }) {
  const initials = artist.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);
  const mood = artist.relationship >= 35 ? 'warm' : artist.relationship < -10 ? 'cold' : 'neutral';
  return (
    <span class={`avatar ${size} ${mood}`} style={{ '--h': hueOf(artist.id) }} title={relationshipLabel(artist.relationship)}>
      {initials}
    </span>
  );
}

export function Meter({ value, max = 100, tone = 'accent' }: { value: number; max?: number; tone?: 'accent' | 'good' | 'bad' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span class={`meter ${tone}`}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

/** Two-sided bar for relationships, -100 .. 100 with the centre at zero. */
export function RelationshipBar({ value }: { value: number }) {
  const pct = Math.abs(value) / 2;
  return (
    <span class="relbar">
      <i class={value < 0 ? 'neg' : 'pos'} style={value < 0 ? { right: '50%', width: `${pct}%` } : { left: '50%', width: `${pct}%` }} />
    </span>
  );
}

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren }) {
  return (
    <div class="sheet">
      <header>
        <span class="grab" />
        <h2>{title}</h2>
        <button class="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </header>
      <div class="sheet-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  );
}

export function Seg<T extends string | number>({
  options,
  value,
  onPick,
}: {
  options: { value: T; label: ComponentChildren; disabled?: boolean }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div class="seg">
      {options.map((o) => (
        <button class={o.value === value ? 'on' : ''} disabled={o.disabled} onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
