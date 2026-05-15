# Plan: Add "Due Today" Section to Show Detail Task List

## Context
The dashboard's Due Today / Overdue slider already distinguishes "due today" (`daysOverdue === 0`) from overdue items. The show detail task list currently puts tasks due today into the **Upcoming** bucket (since `differenceInDays(today, today) === 0`, which is not `< 0`). This is inconsistent — items that need action today are buried under future tasks. Adding a dedicated **Due Today** section between Overdue and Upcoming brings the show page in line with the dashboard's treatment.

## File to Modify
**`artifacts/show-command-center/src/components/task-list.tsx`**

## Implementation

### 1. Update grouping logic (lines ~120–146)
Add a `dueToday` bucket. When `differenceInDays(dueDate, today) === 0`, push to `dueToday` instead of `upcoming`.

```ts
const dueToday: any[] = [];

// in the loop:
const diff = differenceInDays(dueDate, today);
if (diff < 0) overdue.push(t);
else if (diff === 0) dueToday.push(t);
else upcoming.push(t);
```

Return `{ overdue, dueToday, upcoming, completed }` from the memo.

### 2. Render "Due Today" section
Between the existing Overdue and Upcoming section renders, add a Due Today section styled consistently — amber accent to match the dashboard slider (same color used for `daysOverdue === 0` there).

```tsx
{groupedTasks.dueToday.length > 0 && (
  <div>
    <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-2">
      Due Today
    </h3>
    {groupedTasks.dueToday.map(task => (
      <TaskRow key={task.id} ... />
    ))}
  </div>
)}
```

Reuse the existing `TaskRow` component — no changes needed to task rendering itself.

## Eblasts
The same grouping logic exists in the eblast section of the same file. Apply the identical `dueToday` split there as well, with pink accent (`text-pink-400`) to match eblast color conventions.

## Verification
1. Run `pnpm --filter @workspace/show-command-center run typecheck` — should pass clean.
2. Open a show that has a task due today — confirm it appears in the new "Due Today" section rather than "Upcoming".
3. Confirm overdue tasks still appear in "Overdue" and future tasks in "Upcoming".
