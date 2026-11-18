# Art Gallery Tycoon

An isometric art-world tycoon for phones, played in a portrait 9:16 frame. Run a
**Gallery** (earn by selling works) or a **Museum** (earn from ticket sales),
court a cast of artist personas, throw openings and events, and keep the wine,
cheese and art budget from sinking you.

This is the **framework**: the core loop works end to end, the content is
placeholder, and every system is a small file meant to be extended.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, use your browser's phone view
npm test           # game-logic tests (no browser needed)
npm run build      # type-check + production build into dist/
node scripts/build-single.mjs   # one self-contained HTML file in dist/
```

## The loop

Each turn is one week:

1. **Market**: buy works on offer. Artists who like you offer more and discount.
2. **Floor**: hang works on wall spots or pedestals; build fixtures (wine bar, benches, plants) on the isometric grid.
3. **Artists**: studio visits build relationships. Neglect cools them.
4. **Events**: book openings, receptions, talks or galas weeks ahead. Pick the
   featured artists, the wine tier, the cheese tier and how many guests to cater for.
5. **Books**: weekly art and hospitality budgets vs. actual spend, ticket price (museum), ledger.
6. **Next week**: sales or tickets come in, events resolve, rent and staff go out, and you get a wrap-up.

Run out of money past the overdraft and the doors close.

## Layout

```
src/
  game/                 Pure game logic. No DOM. Fully testable.
    types.ts            The whole data model (GameState is plain JSON)
    config.ts           Every tuning number: difficulty, venues, events, fixtures, rules
    state.ts            createNewGame()
    actions.ts          Action union + dispatch(state, action): the only way state changes
    turn.ts             advanceWeek(): the weekly simulation order
    rng.ts              Seeded RNG, so runs and tests are reproducible
    save.ts             localStorage save/load (versioned)
    systems/
      artists.ts        Relationships, neglect, fame drift, pricing hooks
      market.ts         Weekly art offers
      events.ts         Event costs, attendance, wine & cheese satisfaction, persona reactions
      floor.ts          Isometric floor plan: fixtures, placement rules, hanging
      ledger.ts         All cash moves through post(), with a category
    venues/
      types.ts          VenueModel interface (how a venue earns money)
      gallery.ts        Sales off the floor and at events
      museum.ts         Ticket sales, collection appeal, price demand
  data/artists.ts       Placeholder artist personas and artwork title parts
  render/
    iso.ts              Isometric projection math (grid <-> screen)
    IsoRenderer.ts      Canvas renderer: walls, floor, fixtures, art, wandering visitors, tap-to-tile
  ui/                   DOM screens (no framework), one panel per tab
tests/game.test.ts      Logic tests
```

## Extending it

- **New artist**: add an entry to `src/data/artists.ts`. Give it `traits` and react to them in `systems/events.ts`.
- **New event type**: add it to `EventKind` in `types.ts` and `EVENT_KIND` in `config.ts`.
- **New fixture** (lighting, gift shop, coat check): add to `FixtureKind`, `FIXTURE`, draw it in `IsoRenderer.drawFixture`, and give it an effect in a system.
- **New venue type**: implement `VenueModel` in `venues/` and register it in `venues/index.ts`.
- **Balance**: almost everything is in `config.ts`.
- **Art**: the renderer draws everything procedurally. Swap in sprites in `IsoRenderer` without touching game logic.

## Design rules

- The UI never mutates state; it sends an `Action` to `dispatch`.
- Cash only changes through `ledger.post()`, so the books always add up.
- The renderer only reads state. Visitors walking around are cosmetic.
- Grid coordinates everywhere in logic; pixels only in `render/`.
