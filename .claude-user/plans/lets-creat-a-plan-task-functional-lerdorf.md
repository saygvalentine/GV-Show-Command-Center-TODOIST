# Plan: Preset Tasks Settings Page

## Goal

Add a `/settings` page with a CRUD admin UI so the user can add, edit, and delete preset task templates without touching code. The existing 17 hardcoded presets in `task-list.tsx` are migrated to a `preset_tasks` DB table; `AddTaskDialog` fetches from the API instead of the static array.

---

## Files to Create / Modify

### 1. `lib/db/src/schema/presetTasks.ts` (new)

Drizzle table with columns: `id` (serial PK), `name` (text), `category` (text), `dueDateOffset` (integer nullable), `dueDateUnit` (text nullable — "cal"|"biz"), `dueDateDirection` (text nullable — "before"|"after"), `dueDateAnchor` (text nullable — "moveInDate"|"advanceWarehouseDate"|"onlineOrderDeadline"), `createdAt` (timestamp).

`dueDateOffset = null` means "Manual entry" (no calculated date).

Export `insertPresetTaskSchema`, `InsertPresetTask`, `PresetTask` types.

### 2. `lib/db/src/schema/index.ts` (modify)
Add `export * from "./presetTasks";`

### 3. `lib/db/migrations/0001_preset_tasks.sql` (new, hand-written)
Creates the `preset_tasks` table and seeds all 17 current presets:

| name | category | offset | unit | direction | anchor |
|---|---|---|---|---|---|
| Initial Contact Account Executive | Fire Marshal | 60 | cal | before | moveInDate |
| Check In / Submit | Fire Marshal | 30 | biz | before | moveInDate |
| Hard Deadline | Fire Marshal | 30 | cal | before | moveInDate |
| Contact Client / Give Deadline | ID Sign | 30 | cal | before | moveInDate |
| ID Sign Deadline | ID Sign | 12 | biz | before | moveInDate |
| Submit Order | ID Sign | 8 | biz | before | moveInDate |
| Contact Declared but Not Received | Warehouse Manifest | 3 | biz | before | advanceWarehouseDate |
| Get Bucket Due Dates & Quantities | Show Bucket | 10 | biz | before | moveInDate |
| Create Carpet Plan | Show Bucket | 1 | cal | after | onlineOrderDeadline |
| Add CC Tags to XBR List | Show Bucket | 5 | biz | before | moveInDate |
| Finalize Carpet Plan | Show Bucket | 5 | biz | before | moveInDate |
| Begin Bucket Creation | Show Bucket | 5 | biz | before | moveInDate |
| Bucket Due Date | Show Bucket | NULL | NULL | NULL | NULL |
| Send e-Blast for A.E. Vehicle Spotting | Vehicle Spotting | 60 | cal | before | moveInDate |
| Check Vehicle Spotting / Provide To Beau | Vehicle Spotting | 40 | cal | before | moveInDate |
| Check Vehicle Spotting / Provide To Beau 2 | Vehicle Spotting | 30 | biz | before | moveInDate |
| Contact Electrical Provider | Electrical | 1 | cal | after | onlineOrderDeadline |

### 4. `lib/db/migrations/meta/_journal.json` (modify)
Add entry `{ "idx": 1, "version": "7", "when": <timestamp>, "tag": "0001_preset_tasks", "breakpoints": true }`.

### 5. `lib/api-spec/openapi.yaml` (modify)
Add after the `/office-tasks/{taskId}` block:

```yaml
/preset-tasks:
  get: operationId: listPresetTasks, returns array of PresetTask
  post: operationId: createPresetTask, body: CreatePresetTaskBody, returns 201 PresetTask

/preset-tasks/{presetId}:
  put: operationId: updatePresetTask, body: UpdatePresetTaskBody, returns 200 PresetTask or 404
  delete: operationId: deletePresetTask, returns 204 or 404
```

Add schemas: `PresetTask`, `CreatePresetTaskBody`, `UpdatePresetTaskBody`.

### 6. Run codegen
```bash
pnpm --filter @workspace/api-spec run codegen
```
Regenerates `lib/api-client-react/src/generated/api.ts` and `lib/api-zod/src/generated/`.

### 7. `artifacts/api-server/src/routes/presetTasks.ts` (new)
Express CRUD router (same pattern as `officeTasks.ts`):
- `GET /` → select all, ordered by id
- `POST /` → insert with Zod validation
- `PUT /:presetId` → update with 404 guard
- `DELETE /:presetId` → delete with 404 guard

### 8. `artifacts/api-server/src/routes/index.ts` (modify)
Add `router.use("/preset-tasks", presetTasksRouter);`

### 9. `artifacts/show-command-center/src/pages/settings.tsx` (new)
Settings page. Structure:
- Page title "Settings" + subtitle
- For each of the 6 categories: a collapsible section listing its presets
- Each preset row: name + computed rule label + Edit (pencil) + Delete (trash) buttons
- "Add Preset" button per category → small inline form or dialog

Rule label computed from structured fields:
- offset=null → "Manual entry"
- offset=N, unit=biz/cal, direction=before/after, anchor=moveInDate/advanceWarehouseDate/onlineOrderDeadline → e.g. "30 biz days before move-in"

Anchor display map: `moveInDate`→"move-in", `advanceWarehouseDate`→"Advance Warehouse", `onlineOrderDeadline`→"Online Order Deadline"

Add/Edit form fields: Name, Category (select), Offset (number, optional), Unit (cal/biz, optional), Direction (before/after, optional), Anchor (select, optional). If Offset is blank → treat as manual.

Uses `useListPresetTasks`, `useCreatePresetTask`, `useUpdatePresetTask`, `useDeletePresetTask` from generated hooks.

### 10. `artifacts/show-command-center/src/components/layout.tsx` (modify)
Add nav link `<Link href="/settings">Settings</Link>` after "Office Tasks". Import `Settings` icon from lucide-react.

### 11. `artifacts/show-command-center/src/App.tsx` (modify)
Add `import Settings from "@/pages/settings";` and `<Route path="/settings" component={Settings} />`.

### 12. `artifacts/show-command-center/src/components/task-list.tsx` (modify)
In `AddTaskDialog`:
- Add `useListPresetTasks` hook (fetches from API)
- Replace hardcoded `presets` array with computed list from API data using `computePresetDate(preset, show)`
- `computePresetDate`: maps structured fields → actual date string using same `subDays`/`addDays`/`subBusinessDays`/`addBusinessDays` logic
- `ruleLabel(preset)`: generates the human-readable rule string from structured fields
- Show loading state while fetching; show "No presets configured. Visit Settings to add some." if list is empty
- The rendered UI (category headers, checkboxes, rule text) stays identical

---

## Key Helper Functions (in task-list.tsx)

```ts
function computePresetDate(preset: PresetTask, show: Show): { date: string; requires: unknown } {
  if (!preset.dueDateOffset || !preset.dueDateUnit || !preset.dueDateDirection || !preset.dueDateAnchor) {
    return { date: "", requires: true }; // manual
  }
  const anchor = (show as any)[preset.dueDateAnchor];
  if (!anchor) return { date: "", requires: null }; // anchor not set
  const anchorDate = parseDateStr(anchor as string);
  const d = preset.dueDateDirection === "before"
    ? (preset.dueDateUnit === "biz" ? subBusinessDays(anchorDate, preset.dueDateOffset) : subDays(anchorDate, preset.dueDateOffset))
    : (preset.dueDateUnit === "biz" ? addBusinessDays(anchorDate, preset.dueDateOffset) : addDays(anchorDate, preset.dueDateOffset));
  return { date: format(d, "yyyy-MM-dd"), requires: anchor };
}

function ruleLabel(preset: PresetTask): string {
  if (!preset.dueDateOffset) return "Manual entry — set due date after adding";
  const anchorMap: Record<string, string> = {
    moveInDate: "move-in",
    advanceWarehouseDate: "Advance Warehouse",
    onlineOrderDeadline: "Online Order Deadline",
  };
  return `${preset.dueDateOffset} ${preset.dueDateUnit} days ${preset.dueDateDirection} ${anchorMap[preset.dueDateAnchor!] ?? preset.dueDateAnchor}`;
}
```

---

## Summary of Changes

| File | Action |
|---|---|
| `lib/db/src/schema/presetTasks.ts` | Create |
| `lib/db/src/schema/index.ts` | Add export |
| `lib/db/migrations/0001_preset_tasks.sql` | Create |
| `lib/db/migrations/meta/_journal.json` | Add entry |
| `lib/api-spec/openapi.yaml` | Add paths + schemas |
| (run codegen) | Regenerate hooks + Zod |
| `artifacts/api-server/src/routes/presetTasks.ts` | Create |
| `artifacts/api-server/src/routes/index.ts` | Register route |
| `artifacts/show-command-center/src/pages/settings.tsx` | Create |
| `artifacts/show-command-center/src/components/layout.tsx` | Add nav link |
| `artifacts/show-command-center/src/App.tsx` | Add route |
| `artifacts/show-command-center/src/components/task-list.tsx` | Refactor AddTaskDialog |
