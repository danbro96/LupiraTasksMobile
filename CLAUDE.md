# LupiraTasksMobile — agent notes

- **Primary product.** `../LupiraTasksWeb` mirrors this app's screen flow and structure; keep changes
  here coherent with it. Android-first (`eas.json` builds Android only), package `com.lupira.tasks`,
  scheme `lupiratasks`, live on Play — see `docs/RELEASE.md` for the EAS/OTA path.
- **Offline-first.** Writes go UI → `enqueue(op)` → one SQLite transaction (optimistic apply + outbox
  row) → background drain replaying to the API with an `Idempotency-Key`; pulls write the server base
  and rebase pending ops. All SQLite access passes a single serialization gate in `data/db.ts` — expo-sqlite's
  `withTransactionAsync` isn't mutexed and races the `SharedObjectRegistry`.
- **Layering** (downward-only, `eslint-plugin-boundaries`): `domain → data → sync → state → ui`, with
  `feedback/`, `debug/`, `config/` as leaves. See README for the per-folder breakdown.
- **API client is generated**: orval → `src/data/api/generated/` (never hand-edit). `client: 'fetch'`
  deliberately, not react-query — reads come from the SQLite mirror, so a query cache would be a
  second, mirror-unaware one.
- **UI stack**: react-native-paper 5 (MD3), themed in `ui/theme/paperTheme.ts` from the app palette;
  React Navigation themes come from `adaptNavigationTheme`. Paper covers the MD3-expressible colors;
  the app's own semantics (`pending`, `failed`, `remoteChange`, `banner*`, `toast*`) stay on
  `useColors()` — both hooks coexist. Components use `const c = useColors(); const styles = useMemo(() => makeStyles(c), [c])`.
  Icons are MaterialCommunityIcons (Paper's set). Confirms use `useConfirm()` (`ui/components/ConfirmDialog.tsx`).
  Tokens mirror the other repos' copies — see DevOps `Guides/design-tokens.md` and its drift check.
- **Do not put Paper components inside `ui/screens/ListDetailScreen.tsx` rows.** That file interleaves
  long-press drag (`react-native-reorderable-list`), a hand-built swipe-to-delete (`Gesture.Pan` —
  `Swipeable`'s open callback doesn't fire reliably here), the remote-change flash, and a drag-freeze
  that pins rendered rows mid-gesture. Rows are memoized by threading `styles`/`palette` **as props**;
  anything calling `useTheme()` per row erodes that.
- Native headers are set imperatively via `useLayoutEffect` + `nav.setOptions` in 5 screens — keep that
  pattern rather than moving to Paper `Appbar`.
- `react-native-worklets/plugin` must stay last in `babel.config.js`.
- Latest stable deps, bump hard. vitest (node env, `*.test.ts` — pure logic only; no UI tests).
  Comment only the non-obvious *why*; docs = present state.
