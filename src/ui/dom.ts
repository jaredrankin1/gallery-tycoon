// Tiny DOM helper so screens read like markup without pulling in a framework.
type Child = Node | string | number | false | null | undefined;
type Props = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === false || c === null || c === undefined) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const money = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

export const shortMoney = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(1)}M` : a >= 10_000 ? `${Math.round(a / 1000)}k` : Math.round(a).toLocaleString('en-US');
  return (n < 0 ? '-$' : '$') + s;
};

let toastTimer = 0;
export function toast(root: HTMLElement, msg: string, kind: 'error' | 'info' = 'info') {
  root.querySelector('.toast')?.remove();
  const el = h('div', { class: `toast ${kind}` }, msg);
  root.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 2600);
}

/** Segmented control: one button per option. */
export function segmented<T extends string | number>(
  options: { value: T; label: string; sub?: string }[],
  current: T,
  onPick: (v: T) => void,
) {
  return h(
    'div',
    { class: 'seg' },
    ...options.map((o) =>
      h('button', { class: o.value === current ? 'on' : '', onclick: () => onPick(o.value) }, o.label, o.sub ? h('small', {}, o.sub) : null),
    ),
  );
}

export function meter(value: number, max = 100, cls = '') {
  return h('div', { class: `meter ${cls}` }, h('i', { style: `width:${Math.max(0, Math.min(100, (value / max) * 100))}%` }));
}
