# LupiraTasksMobile — agent notes

- **Primary product.** `../LupiraTasksWeb` mirrors this app's screen flow and structure; keep changes
  here coherent with it. Android-first (`eas.json` builds Android only), package `com.lupira.tasks`,
  scheme `lupiratasks`, live on Play — see `docs/RELEASE.md` for the EAS/OTA path.
- **Dev backend switching**: `API_PRESETS` in `config/` (prod / LAN / emulator — the emulator preset
  uses `10.0.2.2`, since a LAN IP is unreachable from one). Settings → Developer switches at runtime;
  `authMode: 'dev'` swaps the bearer for `X-Dev-User`, which tasks-api accepts only in Development.
- **Picker choice is by option-set shape, not by app**: `SegmentedPicker` (Paper `SegmentedButtons`)
  for a fixed 2–5 required set; `ChoiceChips` (a wrapping Paper `Chip` row) for dynamic/unbounded sets
  and for clearable single-select. Each lives only where it is used — copy it across when a second app
  needs one, and keep the copies byte-identical.
- **Settings** is `SettingsScreen` (was `AccountScreen`), reached by the cog in the Lists header and
  composed from `List.Subheader` + `List.Item` — the same shape as the sibling apps.
- **Diagnostics**: `debug/log.ts` (redacted zustand buffer + Sentry breadcrumbs), `DebugLogScreen` and `DeveloperScreen` are shared with the sibling apps; Settings gates them on `debugEnabled`.
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
  the whole palette — including the app's own semantics (`pending`, `failed`, `remoteChange`,
  `banner*`, `toast*`) — rides on the Paper theme, and `useColors()` is a typed accessor over
  `useTheme()`. It stays the app's only color hook: **call `useColors()`, never Paper's `useTheme()`
  directly**, so there is one name for the palette. It must keep returning a module-level object
  (`paperLight.colors`) — components do
  `const c = useColors(); const styles = useMemo(() => makeStyles(c), [c])`, and a fresh object per
  render would defeat that. Deriving the palette from `useColorScheme()` instead is what this
  replaced: it was a second source that could disagree with the theme `PaperProvider` holds.
  Icons are MaterialCommunityIcons (Paper's set). Confirms use `useConfirm()` (`ui/components/ConfirmDialog.tsx`).
  Tokens mirror the other repos' copies — see DevOps `Guides/design-tokens.md` and its drift check.
- **Stay in step with the sibling Lupira frontends.** Same components, theme wiring and layout;
  match what they already do rather than inventing a local shape. Shared files stay byte-identical.
- **Row components take `styles`/`palette` as props and are `memo`'d — no Paper components inside
  them** (`ListDetailScreen`, `ListsScreen`, and `PriorityControl`, which renders in those rows).
  Paper's own `Text` calls `useTheme()`, and a per-row theme read is what this keeps out.
  `ListDetailScreen` additionally interleaves long-press drag (`react-native-reorderable-list`), a
  hand-built swipe-to-delete (`Gesture.Pan` — `Swipeable`'s open callback doesn't fire reliably here),
  the remote-change flash, and a drag-freeze that pins rendered rows mid-gesture.
- **Header actions are declared in the navigator's `options`**; `useLayoutEffect` + `setOptions` only
  when the action gates on screen state (a Save enabled only when dirty).
  React Navigation owns the header — Paper's `Appbar` is not used.
- `react-native-worklets/plugin` must stay last in `babel.config.js`.
- Latest stable deps, bump hard. vitest (node env, `*.test.ts` — pure logic only; no UI tests).
  Comment only the non-obvious *why*; docs = present state.
