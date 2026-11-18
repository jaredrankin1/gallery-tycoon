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

The first run is guided: you see the empty room right away, and Theo (your
first regular) walks you through gallery or museum, where the money comes from,
and the name, one choice at a time. The room behind updates as you pick.

The game runs in real time. A day lasts about 20 seconds at normal speed, and
you can pause or play at 1x, 2x or 4x from the top bar. Doors open at 10 AM
and each hour is one simulation step.

- **Art**: buy works that turn up on the market each day. There are 40 real paintings across seven painters, plus sculpture and installation pieces. Artists who like you offer more often and give a discount.
- **Floor**: tap a wall spot or pedestal to hang art, set its price (gallery) or take it down. Tap a painting on the wall to inspect it.
- **Build**: wall spots, pedestals, a wine bar, benches and plants on the isometric grid, with a live placement preview.
- **Crowd**: every visitor the game counts walks in as a person, one for one. Members of the public wear recoloured outfits so they never pass for the named characters; the people icon in the top bar is exactly how many are on the floor right now. Events fill the room with their whole attendance.
- **Visitors**: twelve named characters (collectors, critics, an influencer, students, a regular) walk in, look at what's hanging, and react with their own animations and lines. Each has hidden likes and dislikes you learn by watching. Collectors buy (gallery) or donate (museum), critics review, photographers and influencers bring buzz. Tap anyone on the floor to see what they're doing and thinking.
- **Artists** (under People): studio visits build relationships, and neglect cools them. "Give a show" opens the event planner with that artist already picked.
- **Events**: book an opening, reception, talk or gala on a future night. Choose featured artists, wine and cheese tiers, and how many guests to cater for. Events happen at 7 PM, with a crowd holding glasses on the floor.
- **Books**: the last 14 days of income and spending, weekly art and wine & cheese budgets, the ticket price (museum), and the ledger.

Sales, ticket money, events and artist reactions show up as toasts as they
happen, and sales pop floating "+$" labels over the painting. Rent and staff
are paid every Sunday night. If cash drops below the overdraft limit, the
doors close.

At 9 PM the doors shut to new visitors and everyone still browsing heads for
the exit, so the room is empty by 10 PM. Party guests stay for the event and
leave in time too.

## Layout

```
src/
  game/                 Pure game logic. No DOM. Fully testable.
    types.ts            The whole data model (GameState is plain JSON)
    config.ts           Every tuning number: difficulty, venues, events, fixtures, rules
    state.ts            createNewGame()
    actions.ts          Action union + dispatch(state, action): the only way state changes
    clock.ts            stepHour(): the hourly simulation step and end-of-day work
    rng.ts              Seeded RNG, so runs and tests are reproducible
    save.ts             localStorage save/load (versioned)
    systems/
      artists.ts        Relationships, neglect, fame drift, pricing hooks
      market.ts         Weekly art offers
      events.ts         Event costs, attendance, wine & cheese satisfaction, persona reactions
      floor.ts          Isometric floor plan: fixtures, placement rules, hanging
      ledger.ts         All cash moves through post(), with a category
      feed.ts           notify(): things the player should hear about (toasts)
      taste.ts          How a visitor feels about a work (likes, dislikes, fame, mood)
      visits.ts         Visitor arrivals, visit plans, the shared walk timeline, outcomes
    venues/
      types.ts          VenueModel interface (how a venue earns money)
      gallery.ts        Hourly sale rolls off the floor, and sales at events
      museum.ts         Ticket sales, collection appeal, price demand
  data/artists.ts       Artist personas (with style tags) and artwork title parts
  data/paintings.ts     The painting catalogue: image, title, artist, extra style tags
  data/guests.ts        Visitor characters: role, tastes, budget, traits, lines
  render/
    iso.ts              Isometric projection math (grid <-> screen)
    IsoRenderer.ts      Canvas renderer: walls, floor, fixtures, art, animated visitors, tap targets
    paintings.ts        Painting images (built by tools/slice_art.py)
    sprites.ts          Sprite atlases and portraits (built by tools/slice_sprites.py)
  ui/                   Preact UI
    store.ts            Holds the game, runs the real-time clock, autosaves
    Game.tsx            HUD, speed controls, dock, toasts, canvas wiring
    Onboarding.tsx      Guided first run over the live room
    GuestCard.tsx       Card for a visitor you tapped
    Inspector.tsx       Card for whatever tile you tapped
    BuildTray.tsx       Build mode
    sheets/             Art, People (visitors + artists), Events, Books slide-up sheets
tests/game.test.ts      Logic tests
```

## Extending it

- **New artist**: add an entry to `src/data/artists.ts`. Give it `traits` and react to them in `systems/events.ts`.
- **New event type**: add it to `EventKind` in `types.ts` and `EVENT_KIND` in `config.ts`.
- **New fixture** (lighting, gift shop, coat check): add to `FixtureKind`, `FIXTURE`, draw it in `IsoRenderer.drawFixture`, and give it an effect in a system.
- **New venue type**: implement `VenueModel` in `venues/` and register it in `venues/index.ts`.
- **Balance**: almost everything is in `config.ts`.
- **New visitor**: drop a sprite sheet in `art/source/` (fixed grid layout) and run `python3 tools/slice_sprites.py`, or in `art/source/v2/` (free-form sheets) and point at each frame in `tools/slice_sprites_v2.py`, then run it. Run the v2 script after the first one, since the first rewrites `sprites.json`. Then add a seed to `src/data/guests.ts`.
- **New painting**: add a card sheet to `art/source/paintings/`, run `python3 tools/slice_art.py`, and list each work in `src/data/paintings.ts`.
- **Art**: rooms and sculpture are procedural; paintings and characters come from the sheets in `art/source/`.

## Design rules

- The UI never mutates state; it sends an `Action` to `dispatch`. The clock is just a `tick` action sent on a timer, so tests can fast-forward days instantly.
- Cash only changes through `ledger.post()`, so the books always add up.
- The renderer only reads state. Visitors walking around are cosmetic.
- Grid coordinates everywhere in logic; pixels only in `render/`.
