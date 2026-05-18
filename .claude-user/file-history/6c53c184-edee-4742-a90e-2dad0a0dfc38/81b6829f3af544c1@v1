import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  ChevronLeft, ChevronRight, ChevronDown,
  Check, Timer, Play, Pause, RotateCcw, ArrowLeft, AlertTriangle, Edit2, Loader2,
  Flame, Signpost, Briefcase, Warehouse, Globe, DollarSign,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOverdueItems,
  useUpdateTask,
  useUpdateEblast,
  getGetOverdueItemsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDate, parseDateStr, getUrgencyInfo } from "@/lib/date-utils";
import { differenceInDays, startOfDay, format } from "date-fns";

const PRESET_CATEGORIES = [
  "Fire Marshal", "ID Sign", "Warehouse Manifest",
  "Show Bucket", "Vehicle Spotting", "Electrical",
];

const editItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(),
  dueDate: z.string().optional(),
  dueDateRule: z.string().optional(),
  notes: z.string().optional(),
});

function EditItemDialog({ item, open, onOpenChange, onSuccess }: {
  item: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const updateTask = useUpdateTask();
  const updateEblast = useUpdateEblast();

  const form = useForm<z.infer<typeof editItemSchema>>({
    resolver: zodResolver(editItemSchema),
    defaultValues: { name: "", category: "", dueDate: "", dueDateRule: "", notes: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: item.name,
        category: item.category ?? "",
        dueDate: item.dueDate ? String(item.dueDate).split("T")[0] : "",
        dueDateRule: item.dueDateRule ?? "",
        notes: item.notes ?? "",
      });
    }
  }, [open, item]);

  const onSubmit = (data: z.infer<typeof editItemSchema>) => {
    if (item.type === "task") {
      updateTask.mutate(
        { showId: item.showId, taskId: item.id, data },
        {
          onSuccess: () => { toast({ title: "Task updated" }); onOpenChange(false); onSuccess(); },
          onError: () => toast({ title: "Error updating task", variant: "destructive" }),
        }
      );
    } else {
      updateEblast.mutate(
        { showId: item.showId, eblastId: item.id, data },
        {
          onSuccess: () => { toast({ title: "eBlast updated" }); onOpenChange(false); onSuccess(); },
          onError: () => toast({ title: "Error updating eBlast", variant: "destructive" }),
        }
      );
    }
  };

  const isPending = updateTask.isPending || updateEblast.isPending;
  const isTask = item.type === "task";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Edit {isTask ? "Task" : "E-Blast"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name *</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              {isTask && (
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {PRESET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="dueDate" render={({ field }) => (
                <FormItem className={!isTask ? "col-span-2" : ""}>
                  <FormLabel>Due Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="dueDateRule" render={({ field }) => (
              <FormItem>
                <FormLabel>Due Date Rule</FormLabel>
                <FormControl><Input placeholder="e.g. 30 cal days before move-in" {...field} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea className="resize-none" rows={3} {...field} /></FormControl>
              </FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  "Show Bucket":        "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Fire Marshal":       "bg-red-500/15 text-red-400 border-red-500/30",
  "ID Sign":            "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Warehouse Manifest": "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "Vehicle Spotting":   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  eblast:               "bg-pink-500/15 text-pink-400 border-pink-500/30",
};

function chipClass(type: string, category: string | null | undefined) {
  if (type === "eblast") return CATEGORY_COLORS["eblast"];
  return CATEGORY_COLORS[category ?? ""] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30";
}

function itemKey(type: string, id: number) {
  return `${type}-${id}`;
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function DashboardTaskSlider() {
  const queryClient = useQueryClient();
  const { data: rawItems, isLoading } = useGetOverdueItems();
  const updateTask = useUpdateTask();
  const updateEblast = useUpdateEblast();

  const [index, setIndex] = useState(0);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({});
  const [completing, setCompleting] = useState<Record<string, boolean>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [editOpen, setEditOpen] = useState(false);

  // Pomodoro state
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pomodoroOpen, setPomodoroOpen] = useState(false);
  const [presets, setPresets] = useState<[number, number, number]>([2, 5, 30]);
  const [selectedPreset, setSelectedPreset] = useState<0 | 1 | 2 | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [timesUp, setTimesUp] = useState(false);

  const items = useMemo(() => {
    if (!rawItems) return [];
    const dueToday = rawItems.filter(i => i.daysOverdue === 0);
    const overdue = rawItems
      .filter(i => i.daysOverdue > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
    return [...dueToday, ...overdue];
  }, [rawItems]);

  // Seed note drafts when items load
  useEffect(() => {
    if (!items.length) return;
    setNoteDrafts(prev => {
      const next = { ...prev };
      for (const item of items) {
        const k = itemKey(item.type, item.id);
        if (!(k in next)) next[k] = item.notes ?? "";
      }
      return next;
    });
  }, [items]);

  // Countdown ticker
  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current!);
          setIsRunning(false);
          setTimesUp(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [isRunning]);

  // Close pomodoro when navigating to a different card
  useEffect(() => {
    clearInterval(intervalRef.current!);
    setPomodoroOpen(false);
    setSelectedPreset(null);
    setTimeLeft(0);
    setIsRunning(false);
    setTimesUp(false);
  }, [index]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetOverdueItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  if (isLoading) return <Skeleton className="w-full h-40 rounded-lg" />;
  if (items.length === 0) return null;

  const safeIndex = Math.min(index, items.length - 1);
  const item = items[safeIndex];
  const isToday = item.daysOverdue === 0;
  const total = items.length;
  const key = itemKey(item.type, item.id);
  const currentNote = noteDrafts[key] ?? item.notes ?? "";
  const isCompleting = completing[key] ?? false;
  const isNoteOpen = noteOpen[key] ?? false;
  const accentText = isToday ? "text-amber-400" : "text-red-400";

  // ── Navigation ────────────────────────────────────────────────────────────
  const prev = () => setIndex(i => Math.max(0, i - 1));
  const next = () => setIndex(i => Math.min(total - 1, i + 1));

  // ── Notes ─────────────────────────────────────────────────────────────────
  const saveNote = () => {
    const draft = currentNote;
    const original = item.notes ?? "";
    if (draft === original) return;
    if (item.type === "task") {
      updateTask.mutate(
        { showId: item.showId, taskId: item.id, data: { notes: draft || null } },
        { onSuccess: () => {
            setSavedFlash(p => ({ ...p, [key]: true }));
            setTimeout(() => setSavedFlash(p => ({ ...p, [key]: false })), 1500);
            invalidate();
          }
        }
      );
    } else {
      updateEblast.mutate(
        { showId: item.showId, eblastId: item.id, data: { notes: draft || null } },
        { onSuccess: () => {
            setSavedFlash(p => ({ ...p, [key]: true }));
            setTimeout(() => setSavedFlash(p => ({ ...p, [key]: false })), 1500);
            invalidate();
          }
        }
      );
    }
  };

  const openNote = () => setNoteOpen(p => ({ ...p, [key]: true }));
  const closeNote = () => {
    saveNote();
    setNoteOpen(p => ({ ...p, [key]: false }));
  };

  // ── Complete / Sent ───────────────────────────────────────────────────────
  const markComplete = () => {
    setCompleting(p => ({ ...p, [key]: true }));
    const now = new Date().toISOString();
    if (item.type === "task") {
      updateTask.mutate(
        { showId: item.showId, taskId: item.id, data: { completed: true, completedAt: now } },
        {
          onSuccess: () => {
            invalidate();
            setIndex(i => Math.max(0, Math.min(i, total - 2)));
            setCompleting(p => ({ ...p, [key]: false }));
          },
          onError: () => setCompleting(p => ({ ...p, [key]: false })),
        }
      );
    } else {
      updateEblast.mutate(
        { showId: item.showId, eblastId: item.id, data: { sent: true, sentAt: now } },
        {
          onSuccess: () => {
            invalidate();
            setIndex(i => Math.max(0, Math.min(i, total - 2)));
            setCompleting(p => ({ ...p, [key]: false }));
          },
          onError: () => setCompleting(p => ({ ...p, [key]: false })),
        }
      );
    }
  };

  // ── Pomodoro helpers ──────────────────────────────────────────────────────
  const openPomodoro = () => setPomodoroOpen(true);

  const closePomodoro = () => {
    clearInterval(intervalRef.current!);
    setPomodoroOpen(false);
    setSelectedPreset(null);
    setTimeLeft(0);
    setIsRunning(false);
    setTimesUp(false);
  };

  const selectPreset = (i: 0 | 1 | 2) => {
    clearInterval(intervalRef.current!);
    setIsRunning(false);
    setTimesUp(false);
    setSelectedPreset(i);
    setTimeLeft(presets[i] * 60);
  };

  const adjustPreset = (i: 0 | 1 | 2, delta: number) => {
    setPresets(p => {
      const next: [number, number, number] = [...p] as [number, number, number];
      next[i] = Math.max(1, next[i] + delta);
      if (selectedPreset === i) {
        clearInterval(intervalRef.current!);
        setIsRunning(false);
        setTimesUp(false);
        setTimeLeft(next[i] * 60);
      }
      return next;
    });
  };

  const toggleTimer = () => {
    if (selectedPreset === null) return;
    if (timeLeft === 0) {
      setTimeLeft(presets[selectedPreset] * 60);
      setTimesUp(false);
    }
    setIsRunning(r => !r);
  };

  const resetTimer = () => {
    clearInterval(intervalRef.current!);
    setIsRunning(false);
    setTimesUp(false);
    if (selectedPreset !== null) setTimeLeft(presets[selectedPreset] * 60);
  };

  const showTab = item.type === "eblast" ? "eblasts" : "tasks";
  const completionLabel = item.type === "eblast" ? "Mark Sent" : "Mark Complete";
  const outerBorder = isToday ? "border-amber-500/35 bg-amber-500/[0.06]" : "border-red-500/35 bg-red-500/[0.06]";
  const iconRing = isToday ? "bg-amber-500/20" : "bg-red-500/20";
  const completeBtn = isToday
    ? "bg-amber-500 hover:bg-amber-400 text-black"
    : "bg-red-500 hover:bg-red-400 text-white";
  // kept for pomodoro view compat
  const headerBand = isToday
    ? "bg-amber-500/20 border-b border-amber-500/35"
    : "bg-red-500/20 border-b border-red-500/35";

  // ── Pomodoro view ─────────────────────────────────────────────────────────
  if (pomodoroOpen) {
    return (
      <div className={`rounded-xl border ${outerBorder}`}>
        <div className="px-4 pt-4 pb-4 flex flex-col gap-2 min-h-[168px] justify-between">

          {/* Row 1: Back (left) · chip (true center) · Focus Timer (right) */}
          <div className="relative flex items-center">
            <button
              onClick={closePomodoro}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
            <span className={`absolute left-1/2 -translate-x-1/2 text-xs font-semibold px-2 py-0.5 rounded-md border ${chipClass(item.type, item.category)}`}>
              {item.type === "eblast" ? "E-Blast" : (item.category ?? "Task")}
            </span>
            <span className={`ml-auto text-xs font-bold uppercase tracking-widest ${accentText}`}>Focus Timer</span>
          </div>

          {/* Row 2: task name — centered */}
          <p className="text-xl font-bold leading-snug text-center">{item.name}</p>

          {/* Row 3: timer readout — centered */}
          <div className="flex flex-col items-center gap-0.5">
            <span className={`text-3xl font-black tabular-nums tracking-tight ${selectedPreset !== null ? accentText : "text-muted-foreground/30"}`}>
              {selectedPreset !== null ? formatTime(timeLeft) : "--:--"}
            </span>
            {timesUp && <span className={`text-xs font-semibold ${accentText}`}>Time's up!</span>}
          </div>

          {/* Row 4: presets + Start/Reset — all centered on one line */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {([0, 1, 2] as const).map(i => {
              const isSelected = selectedPreset === i;
              return (
                <div key={i} className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => adjustPreset(i, -1)} disabled={presets[i] <= 1}>
                    <span className="text-xs leading-none">−</span>
                  </Button>
                  <button
                    onClick={() => selectPreset(i)}
                    className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                      isSelected
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {presets[i]}m
                  </button>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => adjustPreset(i, 1)}>
                    <span className="text-xs leading-none">+</span>
                  </Button>
                </div>
              );
            })}

            <div className="w-px h-4 bg-border mx-1" />

            <Button size="sm" className={`gap-1.5 ${completeBtn}`} onClick={toggleTimer} disabled={selectedPreset === null}>
              {isRunning
                ? <><Pause className="h-3.5 w-3.5" /> Pause</>
                : <><Play className="h-3.5 w-3.5" /> Start</>
              }
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={resetTimer} disabled={selectedPreset === null} title="Reset">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

        </div>
      </div>
    );
  }

  // ── Default slider view ───────────────────────────────────────────────────
  const moveInDays = item.moveInDate
    ? differenceInDays(startOfDay(parseDateStr(item.moveInDate)), startOfDay(new Date()))
    : null;
  const moveInUrgency = item.moveInDate ? getUrgencyInfo(item.moveInDate) : null;

  return (
    <div className={`rounded-xl border transition-opacity duration-300 ${isCompleting ? "opacity-40 pointer-events-none" : ""} ${outerBorder}`}>
      <div className="px-6 pt-6 pb-5 flex items-start gap-6 min-h-[185px]">

        {/* Left: accent icon */}
        <div className={`rounded-full p-3.5 shrink-0 self-center ${iconRing}`}>
          <AlertTriangle className={`h-10 w-10 ${accentText}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col gap-2.5">

          {/* Row 1: urgency label + category chip */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase tracking-widest shrink-0 ${accentText}`}>
              {isToday ? "Due Today" : `${item.daysOverdue} ${item.daysOverdue === 1 ? "Day" : "Days"} Overdue`}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border shrink-0 ${chipClass(item.type, item.category)}`}>
              {item.type === "eblast" ? "E-Blast" : (item.category ?? "Task")}
            </span>
          </div>

          {/* Row 2: task name — clickable link to show detail */}
          <Link href={`/shows/${item.showId}?tab=${showTab}`}>
            <p className="text-xl font-bold leading-snug hover:underline cursor-pointer">{item.name}</p>
          </Link>

          {/* Row 3: show · due date */}
          <p className="text-sm text-muted-foreground">
            {item.showName}
            <span className="mx-1.5 opacity-40">•</span>
            Due {formatDate(item.dueDate)}
          </p>

          {/* Row 3b: all 6 deadlines on one line */}
          <div className="flex items-center gap-0 text-[11px] text-muted-foreground overflow-hidden">
            {[
              { icon: <Warehouse className="h-3 w-3 shrink-0" />, date: item.advanceWarehouseDate },
              { icon: <DollarSign className="h-3 w-3 shrink-0" />, date: item.discountDeadline },
              { icon: <Globe className="h-3 w-3 shrink-0" />, date: item.onlineOrderDeadline },
              { icon: <Flame className="h-3 w-3 shrink-0" />, date: item.fmDeadlineDate },
              { icon: <Signpost className="h-3 w-3 shrink-0" />, date: item.idSignDeadlineDate },
              { icon: <Briefcase className="h-3 w-3 shrink-0" />, date: item.bucketDueDate },
            ].map((d, i) => (
              <span key={i} className="flex items-center whitespace-nowrap">
                {i > 0 && i !== 3 && <span className="mx-1.5 opacity-40">|</span>}
                {i === 3 && <span className="mx-2 opacity-70 font-bold text-sm">|</span>}
                {d.icon}
                <span className="ml-1 font-medium text-foreground">
                  {d.date ? format(parseDateStr(d.date), "M/d") : "N/A"}
                </span>
              </span>
            ))}
          </div>

          {/* Row 4: note */}
          <div className="flex-1 min-w-0">
            {!isNoteOpen ? (
              <button
                onClick={openNote}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
              >
                <ChevronDown className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-80" />
                <span className="truncate">{currentNote || "Add a note…"}</span>
              </button>
            ) : (
              <div className="flex flex-col gap-1">
                <Textarea
                  key={key}
                  autoFocus
                  value={currentNote}
                  onChange={e => setNoteDrafts(p => ({ ...p, [key]: e.target.value }))}
                  onBlur={closeNote}
                  placeholder="Add a note…"
                  className="resize-none text-xs min-h-[48px]"
                  rows={2}
                />
                {savedFlash[key] && <span className="text-xs text-muted-foreground">Saved</span>}
              </div>
            )}
          </div>

          {/* Pagination dots */}
          {total > 1 && total <= 10 && (
            <div className="flex items-center gap-1">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  className={`rounded-full transition-all ${
                    i === safeIndex
                      ? `h-1.5 w-4 ${isToday ? "bg-amber-400" : "bg-red-400"}`
                      : "h-1.5 w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>{/* /content */}

        {/* Right panel: nav · days counter · action buttons — stacked vertically */}
        <div className="w-px self-stretch bg-border/50 shrink-0 mx-1" />
        <div className="flex flex-col items-center justify-between shrink-0 gap-2 w-[200px]">

          {/* Nav arrows — full width */}
          <div className="flex items-center justify-between w-full">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prev} disabled={safeIndex === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums font-medium select-none whitespace-nowrap">
              {safeIndex + 1} of {total}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={next} disabled={safeIndex === total - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Days until move-in box — full width */}
          {moveInDays !== null && moveInUrgency && (
            <div className={`flex flex-col items-center gap-0 leading-none text-center py-2 rounded-lg border w-full ${
              isToday ? "border-amber-500/40 bg-amber-500/[0.06]" : "border-red-500/40 bg-red-500/[0.06]"
            }`}>
              <span className={`text-4xl font-black tabular-nums tracking-tight ${moveInUrgency.textClass}`}>
                {Math.abs(moveInDays)}
              </span>
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                {moveInDays < 0 ? "Days Ago" : "Days"}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">Move-In</span>
            </div>
          )}

          {/* Action buttons — full width */}
          <div className="flex items-center gap-1.5 justify-between w-full">
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={openPomodoro} title="Pomodoro timer">
              <Timer className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setEditOpen(true)} title="Edit">
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              className={`gap-1.5 flex-1 ${completeBtn}`}
              onClick={markComplete}
              disabled={isCompleting}
            >
              <Check className="h-3.5 w-3.5" />
              {completionLabel}
            </Button>
          </div>

        </div>{/* /right panel */}
      </div>
      <EditItemDialog
        item={item}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={invalidate}
      />
    </div>
  );
}
