# Plan: Functional Search Bar

## Context

The navbar search bar (`layout.tsx`) is a static, non-functional `<Input>` with no state, no event handlers, and no connection to the dashboard. Users see a "Search shows..." field that does nothing. This plan wires it up to filter shows on the dashboard — the only view that lists shows — with real-time filtering when already on the dashboard and Enter-key navigation from other pages.

## Approach: URL query param (`?q=`)

State lives in the URL (`/?q=imex`). No context or prop drilling needed.

- **Layout** owns the input, syncs its value to/from the URL `?q` param, and navigates on change (replace-mode when already on `/`, push-mode on Enter from other pages).
- **Dashboard** reads `?q` from the URL and filters the shows list before rendering.
- **wouter** is already imported in both files; `useSearch()` is the only new hook needed.

---

## File Changes

### 1. `artifacts/show-command-center/src/components/layout.tsx`

**Imports to add:** `useState, useEffect` (react); `useSearch` (wouter); `X` (lucide-react)

**Logic to add:**
```
const [, navigate] = useLocation();          // already have [location]
const searchStr = useSearch();               // "?q=imex" or ""

// Sync input value from URL when on dashboard
const qFromUrl = location === "/" ? (new URLSearchParams(searchStr).get("q") ?? "") : "";
const [query, setQuery] = useState(qFromUrl);
useEffect(() => { setQuery(qFromUrl); }, [qFromUrl]);

const handleChange = (val: string) => {
  setQuery(val);
  if (location === "/") {
    // Real-time filtering on dashboard (replace so Back button isn't polluted)
    navigate(val.trim() ? `/?q=${encodeURIComponent(val.trim())}` : "/", { replace: true });
  }
};

const handleKeyDown = (e) => {
  if (e.key === "Enter" && query.trim()) navigate(`/?q=${encodeURIComponent(query.trim())}`);
  if (e.key === "Enter" && !query.trim()) navigate("/");
  if (e.key === "Escape") { setQuery(""); navigate("/"); }
};

const clearSearch = () => { setQuery(""); navigate("/"); };
```

**JSX changes:**
- Make `<Input>` controlled: add `value={query}`, `onChange`, `onKeyDown`
- Add `pr-8` to Input className (room for X button)
- Render `<button onClick={clearSearch}><X /></button>` absolutely positioned on the right when `query` is non-empty

---

### 2. `artifacts/show-command-center/src/pages/dashboard.tsx`

**Imports to add:** `useSearch` (wouter)

**Logic to add:**
```tsx
const searchStr = useSearch();
const searchQuery = new URLSearchParams(searchStr).get("q")?.trim() ?? "";
```

**`activeShows` useMemo** — add one filter step after the existing date filter:
```tsx
.filter(s => !searchQuery ||
  s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
  (s.venue ?? "").toLowerCase().includes(searchQuery.toLowerCase()))
```

Apply the same filter to **`archivedShows`** useMemo.

**Empty state** — update the "No active shows" message:
```tsx
{searchQuery
  ? `No shows match "${searchQuery}".`
  : "No active shows found. Add one to get started."}
```

**Auto-expand archived** — if `searchQuery` is set and `archivedShows.length > 0`, default `archivedOpen` to `true`:
```tsx
const [archivedOpen, setArchivedOpen] = useState(false);
// Add this effect:
useEffect(() => {
  if (searchQuery && archivedShows.length > 0) setArchivedOpen(true);
}, [searchQuery, archivedShows.length]);
```

---

## Behaviour Summary

| Scenario | Result |
|---|---|
| Type on dashboard | Shows filter in real-time; URL updates (replace) |
| Press Enter on dashboard | Same as above but adds to history |
| Type + Enter from Calendar/Office Tasks | Navigates to `/?q=term` |
| Press Escape anywhere | Clears input, navigates to `/` |
| Click × button | Clears input, navigates to `/` |
| Navigate to `/?q=foo` directly | Input populates with "foo", shows filtered |
| No matches in active, matches in archived | Archived section auto-expands |

---

## Files Modified

- `artifacts/show-command-center/src/components/layout.tsx`
- `artifacts/show-command-center/src/pages/dashboard.tsx`

No API, schema, or backend changes needed.

---

## Verification

1. Start the dev servers (`pnpm --filter @workspace/api-server run dev` + `pnpm --filter @workspace/show-command-center run dev`)
2. On dashboard: type a show name fragment — cards filter in real-time
3. On calendar page: type a show name + Enter — navigates to dashboard with filtered results
4. Clear with × or Escape — all shows return
5. Archived shows with matching name auto-expand when searched
6. Run existing Playwright tests to confirm no regressions: `pnpm --filter @workspace/show-command-center run test -- tests/features.spec.ts`
