import { FIXTURE, FIXTURE_EFFECTS, type FixtureKind } from '../game';
import { shortMoney } from './bits';
import { useGame, type BuildTool } from './context';
import { Icon } from './icons';

const HINT: Record<FixtureKind, string> = {
  wallHang: 'Holds one painting. Back walls only.',
  pedestal: 'Holds one work anywhere on the floor.',
  bar: `Better events: +${Math.round(FIXTURE_EFFECTS.barSatisfaction * 100)}% guest happiness each.`,
  bench: `Museums: +${Math.round(FIXTURE_EFFECTS.benchVisitorBonus * 100)}% visitors each.`,
  plant: 'Purely decorative. Looks nice.',
};

/** Mini drawings of each fixture so the tray reads at a glance. */
function FixtureGlyph({ kind }: { kind: BuildTool }) {
  if (kind === 'remove') return <Icon name="trash" size={26} />;
  return <span class={`glyph g-${kind}`} />;
}

export function BuildTray() {
  const { ui, setUi, state } = useGame();
  const tools: BuildTool[] = [...(Object.keys(FIXTURE) as FixtureKind[]), 'remove'];
  const hint = !ui.build
    ? 'Pick an item, then tap the floor. Green tiles are free.'
    : ui.build === 'remove'
      ? 'Tap anything on the floor to remove it. Art goes back to storage.'
      : `${HINT[ui.build]} Tap a green tile to place it.`;

  return (
    <div class="tray">
      <div class="tray-head">
        <small>{hint}</small>
        <button class="btn tiny primary" onClick={() => setUi({ building: false, build: null })}>
          <Icon name="check" size={14} /> Done
        </button>
      </div>
      <div class="tray-items">
        {tools.map((k) => {
          const cost = k === 'remove' ? 0 : FIXTURE[k].cost;
          return (
            <button
              class={`tray-item ${ui.build === k ? 'on' : ''}`}
              disabled={k !== 'remove' && state.cash < cost}
              onClick={() => setUi({ build: ui.build === k ? null : k })}
            >
              <FixtureGlyph kind={k} />
              <b>{k === 'remove' ? 'Remove' : FIXTURE[k].label}</b>
              <small>{k === 'remove' ? 'Free' : shortMoney(cost)}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
