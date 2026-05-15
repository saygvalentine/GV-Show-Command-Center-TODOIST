# Plan: Pomodoro Timer in Dashboard Task Slider

## Context
The `DashboardTaskSlider` shows due-today/overdue tasks one at a time. The user wants a Pomodoro focus mode that opens inline inside the same card — not a modal. When open, the card transforms into a focused timer view: task name/info centered prominently, a countdown display, three adjustable preset duration buttons, and start/pause controls.

## File to Modify
`artifacts/show-command-center/src/components/dashboard-task-slider.tsx`

No new files, no API changes, no codegen needed.

---

## Implementation

### 1. New state (all local to the component)

```ts
const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
const [pomodoroOpen, setPomodoroOpen] = useState(false);
const [presets, setPresets] = useState<[number, number, number]>([2, 5, 30]); // minutes
const [selectedPreset, setSelectedPreset] = useState<0 | 1 | 2 | null>(null);
const [timeLeft, setTimeLeft] = useState(0);   // seconds
const [isRunning, setIsRunning] = useState(false);
```

### 2. Timer logic (useEffect)

```ts
useEffect(() => {
  if (!isRunning) return;
  intervalRef.current = setInterval(() => {
    setTimeLeft(t => {
      if (t <= 1) {
        clearInterval(intervalRef.current!);
        setIsRunning(false);
        return 0;
      }
      return t - 1;
    });
  }, 1000);
  return () => clearInterval(intervalRef.current!);
}, [isRunning]);
```

### 3. Helper functions

- `openPomodoro()` — sets `pomodoroOpen = true`
- `closePomodoro()` — clears interval, resets all pomodoro state, sets `pomodoroOpen = false`
- `selectPreset(i)` — sets `selectedPreset = i`, `timeLeft = presets[i] * 60`, stops timer
- `adjustPreset(i, delta)` — clamps `presets[i] + delta` to min 1; if that preset is selected, also updates `timeLeft`
- `toggleTimer()` — toggles `isRunning`; if `timeLeft === 0` and a preset is selected, reset `timeLeft` first
- `resetTimer()` — stops timer, resets `timeLeft` to `presets[selectedPreset] * 60`

Also reset pomodoro state when the slider index changes (close it or just stop the timer).

### 4. Formatting helper

```ts
function formatTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
```

### 5. Trigger button

In the existing actions row (next to "Mark Complete"), add a small icon button:

```tsx
<Button variant="ghost" size="icon" className="h-7 w-7" onClick={openPomodoro} title="Pomodoro">
  <Timer className="h-4 w-4" />   {/* lucide-react */}
</Button>
```

### 6. Pomodoro view (replaces normal card body when `pomodoroOpen`)

Rendered as a conditional branch inside the card wrapper (same outer `div` with border/bg):

```
┌─────────────────────────────────────────────────────┐
│  [← back/X]                                         │
│                                                      │
│         [category chip]                             │
│         Task Name (large, centered)                 │
│         Show Name • Due date (muted, centered)      │
│                                                      │
│              00:00  ← MM:SS (huge)                  │
│                                                      │
│   [−] 2 min [+]   [−] 5 min [+]   [−] 30 min [+]  │
│            (selected preset highlighted)             │
│                                                      │
│         [ ▶ Start ] or [ ⏸ Pause ]  [ ↺ Reset ]    │
└─────────────────────────────────────────────────────┘
```

- Timer display: `text-6xl font-black tabular-nums` centered
- Preset row: three groups, each `[−] [N min] [+]`; the center button selects the preset and is highlighted with `bg-primary/15 border-primary/30` when selected
- Start/Pause uses the same amber/red accent color as the card
- When `timeLeft === 0` and timer was running: flash "Time's up!" beneath the display
- `[←]` / close button top-left exits pomodoro view (calls `closePomodoro`)

---

## Verification
1. Start the frontend dev server: `pnpm --filter @workspace/show-command-center run dev`
2. Navigate to the dashboard — confirm the slider appears for any due/overdue items
3. Click the timer icon → card transforms to pomodoro view
4. Verify task name/info is centered and prominent
5. Click `[+]` / `[−]` on each preset to confirm values adjust (min 1 min)
6. Select a preset → MM:SS display updates
7. Click Start → countdown ticks; Pause → halts; Reset → returns to preset time
8. Timer reaches 0 → stops, shows "Time's up!"
9. Click back/X → returns to normal slider view, timer cleared
10. Navigate to next card while pomodoro open → pomodoro resets/closes
11. Run typecheck: `pnpm --filter @workspace/show-command-center run typecheck`
