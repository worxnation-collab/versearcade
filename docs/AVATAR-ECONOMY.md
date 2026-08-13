# Avatar economy — items, earned skins & paid packs

How Verse Arcade's character avatars monetize **without** paywalling Scripture,
the daily loop, or the sacred. This is the design of record; build from it.

## The three layers

| Layer | How you get it | Cost | Art tier |
|---|---|---|---|
| **Items** — hats, tops, bottoms, held objects | Drop from the **Daily Chest** | Free (earned by playing) | Flat SVG, in-house |
| **Earned skins** — full-look, prestige (e.g. King Baldwin) | Achievement (share 10 days, streaks, seasonal acts) | Free but *worked for* | Flat-but-elaborate |
| **Paid skins** — full-look biblical **heroes**, sold in themed packs | Direct purchase (IAP) | Paid | Commissioned, higher detail |

The split is the whole point: **items feed the free collecting loop, earned skins
are prestige you can't buy, paid skins are the aspirational purchase.** A full
skin transforms the entire avatar (like Baldwin does), which is what makes it
"worth it" — never a $1 hat.

## Principles (non-negotiable)

1. **Honor the holy — don't price it.** Jesus, the Holy Spirit, God the Father,
   and depictions of the crucifixion are **never** paid skins. If represented at
   all, they are *earned devotional acts* (see Seasonal), not merchandise.
2. **Sell heroes, not the divine.** The paid catalog is biblical heroes & saints
   (David, Esther, Moses, Paul…) — vivid, distinctive, and reverent to sell.
3. **Prestige stays unbuyable.** Earned skins (Baldwin and friends) are never in
   the store; that's what makes the paid ones feel special.
4. **Direct purchase only — no paid loot boxes.** Free chests may be random; paid
   cosmetics are the skin you can see. (Faith-audience trust + App Store minor
   rules.)
5. **Cosmetic only.** Nothing here touches XP, scoring, or the daily loop.

## Data model

Extends the existing `AvatarSpec` (`src/types`, `src/data/avatar.ts`). Base look
(skin tone + robe) and the Armor of God pieces stay as-is. Two additions:

```ts
type ItemSlot = 'hat' | 'top' | 'bottoms' | 'held' | 'cape'

interface AvatarSpec {
  skin: string            // skin TONE (unchanged)
  robe: string            // base robe color (unchanged)
  armor: Partial<Record<ArmorSlot, boolean>>   // Armor of God (unchanged)
  items?: Partial<Record<ItemSlot, string>>    // NEW: equipped chest items by id
  skinId?: string | null  // NEW: full-look skin id ('baldwin', 'david', …)
}
```

**Render precedence** (in `components/Character.tsx`):
1. If `skinId` is set **and owned** → render that full skin (overrides base +
   armor + items). This is what the Baldwin branch already does.
2. Else render base (tone + robe) + Armor of God + `items` overlays.

Migration note: fold today's `regalia: 'baldwin'` into `skinId: 'baldwin'` so
there's one "full skin" concept. Keep reading the old field for one release.

### Definitions (`src/data/avatar.ts`)

```ts
interface SkinDef {
  id: string
  name: string
  source: 'earned' | 'paid'
  // earned:
  unlock?: { kind: 'sharedDays' | 'streak' | 'seasonal'; value: number | string }
  // paid:
  pack?: string           // pack sku this skin belongs to
}

interface ItemDef {
  id: string
  slot: ItemSlot
  name: string
  rarity: 'common' | 'uncommon' | 'rare'   // reuses chest rarity weighting
}

interface PackDef {
  sku: string             // IAP product id
  name: string            // "Kings of Israel"
  skinIds: string[]
  priceTier: string
}
```

## Ownership & gating

- **Items** → stored per user; reuse the **collection** system (a new
  `cosmetic-item` category alongside relics) or a `profiles.owned_items text[]`.
  The Daily Chest grants item ids into this set.
- **Earned skins** → gated by the achievement itself (Baldwin: `shared_days >= 10`,
  already live). Optionally auto-grant into an owned set on unlock.
- **Paid skins** → a server-authoritative **entitlements** table
  (`user_id, sku, granted_at, source`) written only by verified IAP. A skin is
  equippable iff its pack sku is entitled. For dev/testing, a manual grant (the
  same way `sharkbait` was unlocked) or a `PREVIEW_STUDIO`-style flag.

Equip rule everywhere: `skinId` renders only if owned/entitled; otherwise fall
back to base. This keeps the client honest even before the server check lands.

## Daily Chest integration

Extend `openChest` (store/collection) and the drop pool:
- Add a **cosmetic-item** drop type beside `relic` and `boost`.
- Rarity-weight it with the existing common/uncommon/rare bands.
- On drop, grant the item id and reveal it in `DailyChest.tsx` (same reveal UI,
  showing the item on the player's character instead of an emoji).
- Never drops paid skins — chests are the *free* funnel only.

## Paid catalog (heroes, not the divine)

Sold as **themed packs** (one IAP each) for coherence + higher value:

- **Kings & Prophets** — David, Elijah, Daniel, Solomon
- **Exodus** — Moses, Aaron, Joshua
- **Women of the Bible** — Esther, Ruth, Deborah, Hannah
- **Acts / Early Church** — Paul, Peter, Stephen

Each skin is a full-look override in the Baldwin mold (distinct silhouette,
palette, held object). Packs bundle 3–4.

### The sacred boundary

- **Never sold, ever:** Jesus, Holy Spirit, God the Father, the crucifixion.
- **Virgin Mary:** denominationally sensitive (reverence differs across
  traditions). Treat as **earn-only or omit** — never a paid SKU.
- **"Carry the cross" / Lenten acts:** an **earned seasonal** unlock (a Lent
  challenge), devotional not transactional.
- **Baldwin & other prestige:** earn-only, forever out of the store.

## Art bar

Reserve commissioning spend for the **paid** tier — that's where quality has to
justify a price. Free items and the base character stay flat/in-house; earned
prestige skins are flat-but-elaborate; paid hero skins get commissioned,
higher-detail art on one consistent style ladder.

## Rollout

1. **Item system + chest drops** (free). Ship a handful of items; validate that
   collecting is fun. No money involved.
2. **Full-skin model** — migrate Baldwin to `skinId`, add one **paid pack behind
   a dev entitlement flag** (no real IAP yet) to prove the equip/gate flow.
3. **IAP** — Apple/Google receipt verification → `entitlements` table; ship the
   first real pack.
4. **Expand** — more packs, seasonal earned skins (Lent/Advent/Easter).

Everything above drops onto the render + gating system already in place; nothing
here requires reworking the daily loop.
