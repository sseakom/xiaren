# Detail Score Ticket Design

## Goal

Optimize the WeChat mini program detail page into a "score ticket" experience. The page should help a user quickly decide whether an animation is worth watching by grouping the cover, identity, WR score, score distribution, personal rating, and save actions into one coherent first-screen flow.

## Scope

In scope:

- `miniprogram/pages/detail/index.tsx`
- `miniprogram/pages/detail/index.module.scss`
- Local class names and JSX grouping needed for the new layout
- Reuse of existing components: `RatingRow`, `ScoreChart`, `TagRow`, `AppIcon`, `Skeleton`

Out of scope:

- Cloud functions
- `services/*`
- Cache behavior
- Navigation rules
- Rating, collection, or correction business logic
- Search or list ranking behavior

## Product Intent

The detail page is the app's core judgment surface. A user arrives from a feed or search result and needs to answer:

- What is this animation?
- How long is it?
- Who made it?
- How did other users rate it?
- Do I want to rate, collect, or mark it watched?

The new layout should reduce scattered cards and turn the first screen into one compact ticket-like object.

## Visual Direction

Use the existing green brand color `#28B894` as the anchor. Add a restrained ticket language:

- paper-like white surface on the existing light page background
- subtle green border and shadow
- dashed divider between identity and scoring areas
- rounded but not overly playful corners
- pill metadata for `bvid`, duration, and author
- large numeric WR score using the existing numeric font stack

The signature element is the "score ticket": a cover-led card that feels like a saved video stub with a rating receipt attached.

## Layout

The detail page keeps the existing vertical flow, but the top half changes:

```text
pageDetail
  detailScroll
    content
      ticketHero
        coverSection
          cover image
          bvid pill
          duration pill
        ticketBody
          title / original title
          author + tags
          ticketDivider
          ticketScore
            WR score
            participant count
            compact ScoreChart
          ticketRating
            RatingRow
            rating hint
          ticketActions
            collect
            watched
      correction link
      bottom safe area
```

The previous separate `summaryCard`, `scoreSection`, `myRatingSection`, and `actionSection` are visually merged inside the ticket hero. Class names can remain where useful, but the rendered page should feel like one coherent surface.

## Interaction

Existing interactions must remain unchanged:

- Tap title to copy title.
- Tap original title to copy original title.
- Tap author to copy author.
- Tap `bvid` to copy `bvid`.
- Rating calls `RatingService.submit`.
- Collect calls `CollectionService.toggle(bvid, 'collect', next)`.
- Watched calls `CollectionService.toggle(bvid, 'watched', next)`.
- Correction navigates to `animation-form` with `mode=correction`.

The watched button label should distinguish inactive and active states:

- inactive: `标记看过`
- active: `已看过`

## Data Flow

No data flow changes.

The page still loads in parallel:

- `AnimationService.getByBvid(bvid)`
- `RatingService.getMyRating(bvid)`
- `CollectionService.getStatus(bvid)`
- `ScoreService.calc(bvid)`

All business identity stays on `bvid`.

## Responsive Behavior

The score block should be stable on mini program widths:

- Use a two-column score layout when there is enough width.
- Collapse into one column on narrow widths.
- Prevent title, badges, and buttons from overflowing their containers.
- Keep `ScoreChart compact` readable with short labels and fixed meta width.

## Error And Empty States

Keep existing behavior:

- Skeleton while loading.
- "动画不存在或已下架" when `anim` is missing.
- `ScoreChart` empty state when there is no distribution.

No new network or business errors are introduced.

## Verification

Run:

```bash
yarn build:weapp
```

Manual checks in WeChat developer tools are recommended:

- Open a normal animation detail page.
- Open a detail page with no score distribution.
- Rate an animation.
- Toggle collect and watched.
- Tap copyable title, author, and `bvid`.
- Open correction flow.

## Constraints Checklist

- No direct client DB access.
- No direct page-level business cloud function calls.
- No `_id` as the detail business key.
- No custom tabbar changes.
- No cache invalidation changes.
- No search algorithm changes.
