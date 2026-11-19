import { FIXTURE, FLOOR_SIZE } from '../config';
import type { Fixture, FixtureKind, FloorPlan, GameState, Id, VenueType } from '../types';

export function createFloor(venue: VenueType): FloorPlan {
  const { width, height } = FLOOR_SIZE[venue];
  const fixtures: Fixture[] = [];
  let n = 0;
  const add = (kind: FixtureKind, x: number, y: number) => fixtures.push({ id: `f-${n++}`, kind, x, y });
  // Starter layout: a few wall spots on each back wall, one bench, a plant by the door.
  for (const y of [1, 3, 5]) add('wallHang', 0, y);
  for (const x of [2, 4]) add('wallHang', x, 0);
  add('bench', Math.floor(width / 2), Math.floor(height / 2) - 1);
  add('plant', width - 1, height - 2);
  return { width, height, entrance: { x: width - 1, y: height - 1 }, fixtures };
}

export const fixtureAt = (floor: FloorPlan, x: number, y: number) =>
  floor.fixtures.find((f) => f.x === x && f.y === y);

export const displayFixtures = (floor: FloorPlan) => floor.fixtures.filter((f) => FIXTURE[f.kind].display);

export const freeDisplayFixture = (floor: FloorPlan) => displayFixtures(floor).find((f) => !f.artworkId);

export const countFixtures = (floor: FloorPlan, kind: FixtureKind) => floor.fixtures.filter((f) => f.kind === kind).length;

/** Returns an error string, or undefined if the spot is legal. */
export function canPlace(floor: FloorPlan, kind: FixtureKind, x: number, y: number): string | undefined {
  if (x < 0 || y < 0 || x >= floor.width || y >= floor.height) return 'That’s outside the building.';
  if (x === floor.entrance.x && y === floor.entrance.y) return 'Keep the entrance clear.';
  if (fixtureAt(floor, x, y)) return 'Something is already there.';
  if (kind === 'shop' && floor.fixtures.some((f) => f.kind === 'shop')) return 'You already have a gift shop.';
  if (FIXTURE[kind].wallOnly && x !== 0 && y !== 0) return 'Wall spots go against a back wall.';
  return undefined;
}

/** Takes an artwork down from whatever it's hanging on. */
export function unhang(state: GameState, artworkId: Id): void {
  for (const f of state.floor.fixtures) if (f.artworkId === artworkId) delete f.artworkId;
}
