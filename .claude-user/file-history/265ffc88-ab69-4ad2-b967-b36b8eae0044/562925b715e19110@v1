import React, { useState, useMemo } from "react";
import { format, differenceInDays, startOfDay, subDays, addDays } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListTasks,
  useUpdateTask,
  useDeleteTask,
  useCreateTask,
  useBulkCreateTasks,
  useListPresetTasks,
  getListTasksQueryKey,
  getGetShowQueryKey,
  Show,
  PresetTask,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Circle, Clock, Edit2, Trash2,
  Plus, Calendar as CalendarIcon, MessageSquare, AlertCircle, AlertTriangle,
  ChevronDown, ChevronUp, Loader2, Filter, X, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getUrgencyInfo, getCategoryColor, formatDate, parseDateStr, subBusinessDays, addBusinessDays } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";

const PRESET_CATEGORIES = [
  "Fire Marshal",
  "ID Sign",
  "Warehouse Manifest",
  "Show Bucket",
  "Vehicle Spotting",
  "Electrical"
];

type SortMode = "dueAsc" | "dueDesc" | "nameAz" | "category";

function applySortToTasks(tasks: any[], mode: SortMode): any[] {
  const arr = [...tasks];
  switch (mode) {
    case "dueAsc":
      return arr.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return parseDateStr(a.dueDate).getTime() - parseDateStr(b.dueDate).getTime();
      });
    case "dueDesc":
      return arr.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return parseDateStr(b.dueDate).getTime() - parseDateStr(a.dueDate).getTime();
      });
    case "nameAz":
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case "category":
      return arr.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? ""));
  }
}

export function TaskList({ show }: { show: Show }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tasks, isLoading } = useListTasks(show.id);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("dueAsc");
  const [groupMode, setGroupMode] = useState<"status" | "category">("status");
  const [filterOpen, setFilterOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [catSectionOpen, setCatSectionOpen] = useState<Record<string, boolean>>({});

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (filterCategories.length === 0) return tasks;
    return tasks.filter(t => filterCategories.includes(t.category ?? ""));
  }, [tasks, filterCategories]);

  const groupedTasks = useMemo(() => {
    const today = startOfDay(new Date());
    const overdue: any[] = [];
    const dueToday: any[] = [];
    const upcoming: any[] = [];
    const completed: any[] = [];

    for (const t of filteredTasks) {
      if (t.completed) { completed.push(t); continue; }
      if (t.dueDate) {
        const dueDate = startOfDay(parseDateStr(t.dueDate));
        const diff = differenceInDays(dueDate, today);
        if (diff < 0) overdue.push(t);
        else if (diff === 0) dueToday.push(t);
        else upcoming.push(t);
      } else {
        upcoming.push(t);
      }
    }

    return {
      overdue: applySortToTasks(overdue, sortMode),
      dueToday: applySortToTasks(dueToday, sortMode),
      upcoming: applySortToTasks(upcoming, sortMode),
      completed: completed.sort((a, b) => {
        if (!a.completedAt) return 1;
        if (!b.completedAt) return -1;
        return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
      }),
    };
  }, [filteredTasks, sortMode]);

  const categoryGrouped = useMemo(() => {
    const result: { cat: string; tasks: any[] }[] = [];
    for (const cat of PRESET_CATEGORIES) {
      const catTasks = filteredTasks.filter(t => t.category === cat);
      if (catTasks.length > 0) result.push({ cat, tasks: applySortToTasks(catTasks, sortMode) });
    }
    const uncategorized = filteredTasks.filter(t => !t.category || !PRESET_CATEGORIES.includes(t.category));
    if (uncategorized.length > 0) result.push({ cat: "Uncategorized", tasks: applySortToTasks(uncategorized, sortMode) });
    return result;
  }, [filteredTasks, sortMode]);

  const toggleTask = (taskId: number, currentCompleted: boolean) => {
    updateTask.mutate({
      showId: show.id,
      taskId,
      data: { completed: !currentCompleted }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
      },
      onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
    });
  };

  const removeTask = (taskId: number) => {
    deleteTask.mutate({ showId: show.id, taskId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
      },
      onError: () => toast({ title: "Failed to delete task", variant: "destructive" }),
    });
  };

  const toggleFilter = (cat: string) => {
    setFilterCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  if (isLoading) {
    return <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>;
  }

  const hasTasks = (tasks?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold tracking-tight">Tasks</h3>
        <AddTaskDialog show={show} />
      </div>

      {hasTasks && (
        <div data-testid="task-toolbar" className="flex flex-wrap items-center gap-2">
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <Filter className="h-3 w-3" />
                Filter
                {filterCategories.length > 0 && (
                  <span className="ml-0.5 bg-primary text-primary-foreground rounded-full h-4 w-4 inline-flex items-center justify-center text-[10px] font-bold">
                    {filterCategories.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-0.5">
                {PRESET_CATEGORIES.map(cat => (
                  <div
                    key={cat}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer select-none"
                    onClick={() => toggleFilter(cat)}
                  >
                    <Checkbox checked={filterCategories.includes(cat)} onCheckedChange={() => toggleFilter(cat)} />
                    <span className="text-sm">{cat}</span>
                  </div>
                ))}
              </div>
              {filterCategories.length > 0 && (
                <Button variant="ghost" size="sm" className="w-full mt-1.5 h-7 text-xs" onClick={() => setFilterCategories([])}>
                  Clear all
                </Button>
              )}
            </PopoverContent>
          </Popover>

          {filterCategories.map(cat => (
            <Badge
              key={cat}
              variant="secondary"
              className="gap-1 h-6 text-xs cursor-pointer pr-1.5 hover:bg-secondary/80"
              onClick={() => toggleFilter(cat)}
            >
              {cat}
              <X className="h-3 w-3 opacity-60" />
            </Badge>
          ))}

          <div className="flex items-center gap-1.5 ml-auto">
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="h-7 text-xs w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dueAsc">Due Date ↑</SelectItem>
                <SelectItem value="dueDesc">Due Date ↓</SelectItem>
                <SelectItem value="nameAz">Name A→Z</SelectItem>
                <SelectItem value="category">Category</SelectItem>
              </SelectContent>
            </Select>

            <div className="inline-flex rounded-md border overflow-hidden text-xs font-medium">
              <button
                className={`px-2.5 py-1 transition-colors ${groupMode === "status" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                onClick={() => setGroupMode("status")}
              >
                Status
              </button>
              <button
                className={`px-2.5 py-1 transition-colors border-l ${groupMode === "category" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                onClick={() => setGroupMode("category")}
              >
                Category
              </button>
            </div>
          </div>
        </div>
      )}

      {groupMode === "status" && (
        <div className="space-y-8">
          {groupedTasks.dueToday.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-semibold uppercase tracking-wider text-sm">
                <AlertTriangle className="h-4 w-4" />
                Due Today
              </div>
              <div className="grid gap-2 border-amber-500/20 border rounded-lg p-2 bg-amber-500/5">
                {groupedTasks.dueToday.map(t => (
                  <TaskRow key={t.id} task={t} showId={show.id} onToggle={() => toggleTask(t.id, t.completed)} onDelete={() => removeTask(t.id)} />
                ))}
              </div>
            </div>
          )}

          {groupedTasks.overdue.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-500 font-semibold uppercase tracking-wider text-sm">
                <div className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </div>
                Overdue
              </div>
              <div className="grid gap-2 border-red-500/20 border rounded-lg p-2 bg-red-500/5">
                {groupedTasks.overdue.map(t => (
                  <TaskRow key={t.id} task={t} showId={show.id} onToggle={() => toggleTask(t.id, t.completed)} onDelete={() => removeTask(t.id)} />
                ))}
              </div>
            </div>
          )}

          {groupedTasks.upcoming.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground font-semibold uppercase tracking-wider text-sm">
                <Clock className="h-4 w-4" />
                Upcoming
              </div>
              <div className="grid gap-2">
                {groupedTasks.upcoming.map(t => (
                  <TaskRow key={t.id} task={t} showId={show.id} onToggle={() => toggleTask(t.id, t.completed)} onDelete={() => removeTask(t.id)} />
                ))}
              </div>
            </div>
          )}

          {groupedTasks.upcoming.length === 0 && groupedTasks.overdue.length === 0 && groupedTasks.dueToday.length === 0 && (
            <div className="text-center py-10 border-2 border-dashed rounded-lg text-muted-foreground">
              {filterCategories.length > 0 ? "No pending tasks match the active filter." : "No pending tasks."}
            </div>
          )}

          {groupedTasks.completed.length > 0 && (
            <Collapsible open={completedOpen} onOpenChange={setCompletedOpen} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-green-500 font-semibold uppercase tracking-wider text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  Completed
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {completedOpen ? "Hide" : "Show"} ({groupedTasks.completed.length})
                    {completedOpen ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-2 opacity-75">
                {groupedTasks.completed.map(t => (
                  <TaskRow key={t.id} task={t} showId={show.id} onToggle={() => toggleTask(t.id, t.completed)} onDelete={() => removeTask(t.id)} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      {groupMode === "category" && (
        <div className="space-y-4">
          {categoryGrouped.length === 0 && (
            <div className="text-center py-10 border-2 border-dashed rounded-lg text-muted-foreground">
              {filterCategories.length > 0 ? "No tasks match the active filter." : "No tasks."}
            </div>
          )}
          {categoryGrouped.map(({ cat, tasks: catTasks }) => {
            const isOpen = catSectionOpen[cat] ?? true;
            const textColorClass = getCategoryColor(cat).split(" ").find(c => c.startsWith("text-")) ?? "text-muted-foreground";
            return (
              <Collapsible
                key={cat}
                open={isOpen}
                onOpenChange={(open) => setCatSectionOpen(prev => ({ ...prev, [cat]: open }))}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-2 font-semibold uppercase tracking-wider text-sm ${textColorClass}`}>
                    {cat}
                    <span className="font-normal text-muted-foreground normal-case tracking-normal">
                      ({catTasks.length})
                    </span>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="grid gap-2">
                  {catTasks.map(t => (
                    <TaskRow key={t.id} task={t} showId={show.id} onToggle={() => toggleTask(t.id, t.completed)} onDelete={() => removeTask(t.id)} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const KEY_TASKS: { category: string; name: string }[] = [
  { category: "Fire Marshal", name: "Submit To FM/EC" },
  { category: "ID Sign", name: "Submit ID Sign Order" },
  { category: "Show Bucket", name: "Bucket Due Date" },
];

export function isKeyTask(task: any) {
  return KEY_TASKS.some((k) => k.category === task.category && k.name === task.name);
}

const editTaskSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(),
  dueDate: z.string().optional(),
  dueDateRule: z.string().optional(),
  notes: z.string().optional(),
});

function TaskRow({ task, showId, onToggle, onDelete }: { task: any, showId: number, onToggle: () => void, onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const handleToggle = () => {
    if (!task.completed) {
      setJustCompleted(true);
      setTimeout(() => setJustCompleted(false), 650);
    }
    onToggle();
  };
  const urgency = getUrgencyInfo(task.dueDate);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateTask = useUpdateTask();

  const onUpdateCompletedAt = (dateStr: string) => {
    if (!dateStr) return;
    updateTask.mutate(
      { showId, taskId: task.id, data: { completedAt: parseDateStr(dateStr).toISOString() } as any },
      {
        onSuccess: () => {
          toast({ title: "Completion date updated" });
          setDatePickerOpen(false);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(showId) });
        },
        onError: () => toast({ title: "Error updating date", variant: "destructive" }),
      }
    );
  };

  const form = useForm<z.infer<typeof editTaskSchema>>({
    resolver: zodResolver(editTaskSchema),
    defaultValues: {
      name: task.name,
      category: task.category ?? "",
      dueDate: task.dueDate ? String(task.dueDate).split("T")[0] : "",
      dueDateRule: task.dueDateRule ?? "",
      notes: task.notes ?? "",
    },
  });

  const openEdit = () => {
    form.reset({
      name: task.name,
      category: task.category ?? "",
      dueDate: task.dueDate ? String(task.dueDate).split("T")[0] : "",
      dueDateRule: task.dueDateRule ?? "",
      notes: task.notes ?? "",
    });
    setEditOpen(true);
  };

  const onEditSubmit = (data: z.infer<typeof editTaskSchema>) => {
    updateTask.mutate(
      { showId, taskId: task.id, data },
      {
        onSuccess: () => {
          toast({ title: "Task updated" });
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(showId) });
          queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(showId) });
        },
        onError: () => toast({ title: "Error updating task", variant: "destructive" }),
      }
    );
  };

  return (
    <div className={`group flex flex-col p-3 rounded-lg border bg-card transition-all duration-300 ${justCompleted ? 'border-green-500/60 bg-green-500/8 scale-[1.01]' : task.completed ? 'opacity-60' : 'hover:border-primary/30'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-1 transition-transform duration-150 ${justCompleted ? 'scale-125' : 'scale-100'}`}>
          <Checkbox
            checked={task.completed}
            onCheckedChange={handleToggle}
            className={`transition-colors duration-300 ${task.completed ? 'data-[state=checked]:bg-green-500 data-[state=checked]:text-white border-green-500' : ''}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isKeyTask(task) && (
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
            )}
            <span className={`relative font-medium transition-colors duration-500 ${task.completed ? 'text-muted-foreground' : ''}`}>
              {task.name}
              <span
                className={`absolute inset-y-0 left-0 flex items-center pointer-events-none ${justCompleted ? 'animate-strikethrough' : ''}`}
                aria-hidden="true"
                style={{ width: justCompleted ? undefined : task.completed ? '100%' : '0%' }}
              >
                <span className="block w-full h-px bg-current opacity-60" />
              </span>
            </span>
            {task.category && (
              <Badge variant="outline" className={`${getCategoryColor(task.category)} border-transparent text-xs py-0 h-5`}>
                {task.category}
              </Badge>
            )}
            {task.notes && !expanded && (
              <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground" onClick={() => setExpanded(true)}>
                <MessageSquare className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs">
            {task.completed && task.completedAt ? (
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 font-medium text-green-500 hover:text-green-400 hover:underline cursor-pointer">
                    <CheckCircle2 className="h-3 w-3" />
                    Done {format(new Date(task.completedAt), "MMM d, yyyy")}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  <p className="text-xs text-muted-foreground mb-2">Adjust completion date</p>
                  <input
                    type="date"
                    defaultValue={format(new Date(task.completedAt), "yyyy-MM-dd")}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    onChange={(e) => onUpdateCompletedAt(e.target.value)}
                  />
                </PopoverContent>
              </Popover>
            ) : task.dueDate ? (
              <div className={`flex items-center gap-1 font-medium ${urgency.textClass}`}>
                <CalendarIcon className="h-3 w-3" />
                {formatDate(task.dueDate)}
                {urgency.daysRemaining !== null && (
                  <span className="ml-1 opacity-80">
                    ({Math.abs(urgency.daysRemaining)}d {urgency.daysRemaining < 0 ? 'ago' : 'left'})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">No due date</span>
            )}
            {task.dueDateRule && (
              <span className="text-muted-foreground italic border-l pl-3">
                {task.dueDateRule}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              {isKeyTask(task) ? (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEdit} title="Edit due date">
                  <CalendarIcon className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEdit}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
            </DialogTrigger>
            <DialogContent className="max-w-md" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Edit Task</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-4">
                  {!isKeyTask(task) && (
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Task Name *</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <div className={!isKeyTask(task) ? "grid grid-cols-2 gap-4" : ""}>
                    {!isKeyTask(task) && (
                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
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
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  {!isKeyTask(task) && (
                    <FormField
                      control={form.control}
                      name="dueDateRule"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date Rule</FormLabel>
                          <FormControl><Input placeholder="e.g. 30 cal days before move-in" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                  {!isKeyTask(task) && (
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl><Textarea className="resize-none" rows={3} {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" type="button" onClick={() => setEditOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={updateTask.isPending}>
                      {updateTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {!isKeyTask(task) && <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Task?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{task.name}"? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>}
        </div>
      </div>

      {expanded && task.notes && (
        <div className="mt-3 ml-7 p-3 bg-muted/30 rounded-md text-sm border border-border/50 whitespace-pre-wrap">
          <div className="flex justify-between items-start gap-2">
            <span>{task.notes}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-muted-foreground" onClick={() => setExpanded(false)}>
              <ChevronUp className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const ANCHOR_DISPLAY: Record<string, string> = {
  moveInDate: "move-in",
  advanceWarehouseDate: "Advance Warehouse",
  onlineOrderDeadline: "Online Order Deadline",
};

function computePresetDate(preset: PresetTask, show: Show): { date: string; requires: unknown } {
  if (!preset.dueDateOffset || !preset.dueDateUnit || !preset.dueDateDirection || !preset.dueDateAnchor) {
    return { date: "", requires: true };
  }
  const anchor = (show as unknown as Record<string, unknown>)[preset.dueDateAnchor];
  if (!anchor) return { date: "", requires: null };
  const anchorDate = parseDateStr(anchor as string);
  const d =
    preset.dueDateDirection === "before"
      ? preset.dueDateUnit === "biz"
        ? subBusinessDays(anchorDate, preset.dueDateOffset)
        : subDays(anchorDate, preset.dueDateOffset)
      : preset.dueDateUnit === "biz"
        ? addBusinessDays(anchorDate, preset.dueDateOffset)
        : addDays(anchorDate, preset.dueDateOffset);
  return { date: format(d, "yyyy-MM-dd"), requires: anchor };
}

function presetRuleLabel(preset: PresetTask): string {
  if (!preset.dueDateOffset) return "Manual entry — set due date after adding";
  const anchor = ANCHOR_DISPLAY[preset.dueDateAnchor!] ?? preset.dueDateAnchor ?? "";
  return `${preset.dueDateOffset} ${preset.dueDateUnit} days ${preset.dueDateDirection} ${anchor}`;
}

function AddTaskDialog({ show }: { show: Show }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createCustomTask = useCreateTask();
  const bulkCreate = useBulkCreateTasks();

  const customSchema = z.object({
    name: z.string().min(1, "Name is required"),
    category: z.string().optional(),
    dueDate: z.string().optional(),
    notes: z.string().optional()
  });

  const form = useForm<z.infer<typeof customSchema>>({
    resolver: zodResolver(customSchema),
    defaultValues: { name: "", category: "", dueDate: "", notes: "" }
  });

  const onSubmitCustom = (data: z.infer<typeof customSchema>) => {
    const cleaned = {
      name: data.name,
      ...(data.category ? { category: data.category } : {}),
      ...(data.dueDate ? { dueDate: data.dueDate } : {}),
      ...(data.notes ? { notes: data.notes } : {}),
    };
    createCustomTask.mutate({ showId: show.id, data: cleaned as any }, {
      onSuccess: () => {
        toast({ title: "Task added" });
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
      }
    });
  };

  const { data: apiPresets = [], isLoading: presetsLoading } = useListPresetTasks();

  const presets = useMemo(
    () =>
      apiPresets.map((p) => {
        const { date, requires } = computePresetDate(p, show);
        return { cat: p.category, name: p.name, requires, date, rule: presetRuleLabel(p) };
      }),
    [apiPresets, show]
  );

  const [selectedPresets, setSelectedPresets] = useState<number[]>([]);

  const togglePreset = (idx: number) => {
    if (selectedPresets.includes(idx)) setSelectedPresets(selectedPresets.filter(i => i !== idx));
    else setSelectedPresets([...selectedPresets, idx]);
  };

  const handleBulkAdd = () => {
    const tasks = selectedPresets.map(idx => {
      const p = presets[idx];
      return { name: p.name, category: p.cat, dueDate: p.date || undefined, dueDateRule: p.rule };
    });
    
    bulkCreate.mutate({ showId: show.id, data: { tasks } }, {
      onSuccess: () => {
        toast({ title: `${tasks.length} tasks added` });
        setOpen(false);
        setSelectedPresets([]);
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Task</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add Tasks</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="preset">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="preset">Preset Workflows</TabsTrigger>
            <TabsTrigger value="custom">Custom Task</TabsTrigger>
          </TabsList>
          
          <TabsContent value="preset" className="space-y-4">
            {presetsLoading && (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            )}
            {!presetsLoading && presets.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                No presets configured. Visit <strong>Settings</strong> to add some.
              </div>
            )}
            {!presetsLoading && presets.length > 0 && (
            <>
            <div className="border rounded-md max-h-[420px] overflow-y-auto">
              {(() => {
                const rows: React.ReactNode[] = [];
                let lastCat = "";
                const catIndices: Record<string, number[]> = {};
                presets.forEach((p, idx) => {
                  if (!catIndices[p.cat]) catIndices[p.cat] = [];
                  if (p.requires) catIndices[p.cat].push(idx);
                });
                presets.forEach((p, idx) => {
                  if (p.cat !== lastCat) {
                    lastCat = p.cat;
                    const catAvail = catIndices[p.cat] ?? [];
                    const allSelected = catAvail.length > 0 && catAvail.every(i => selectedPresets.includes(i));
                    const toggleCat = () => {
                      if (allSelected) {
                        setSelectedPresets(prev => prev.filter(i => !catAvail.includes(i)));
                      } else {
                        setSelectedPresets(prev => [...new Set([...prev, ...catAvail])]);
                      }
                    };
                    rows.push(
                      <div key={`hdr-${p.cat}`} className={`flex items-center justify-between px-3 py-1.5 sticky top-0 !bg-background border-b ${getCategoryColor(p.cat)}`}>
                        <span className="text-[10px] font-bold uppercase tracking-widest">{p.cat}</span>
                        {catAvail.length > 0 && (
                          <button
                            type="button"
                            onClick={toggleCat}
                            className="text-[10px] font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity"
                          >
                            {allSelected ? "Remove all" : "Add all"}
                          </button>
                        )}
                      </div>
                    );
                  }
                  rows.push(
                    <div
                      key={idx}
                      className={`flex items-start gap-3 px-3 py-2.5 border-b last:border-b-0 ${!p.requires ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accent cursor-pointer'} ${selectedPresets.includes(idx) ? 'bg-accent/60' : ''}`}
                      onClick={() => p.requires && togglePreset(idx)}
                    >
                      <Checkbox checked={selectedPresets.includes(idx)} disabled={!p.requires} className="mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium text-sm flex items-center gap-1">
                          {isKeyTask({ category: p.cat, name: p.name }) && (
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                          )}
                          {p.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {!p.requires
                            ? "Missing required show date"
                            : p.date
                            ? `${formatDate(p.date)} · ${p.rule}`
                            : p.rule}
                        </span>
                      </div>
                    </div>
                  );
                });
                return rows;
              })()}
            </div>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  const available = presets.map((_, i) => i).filter(i => presets[i].requires);
                  if (selectedPresets.length === available.length) setSelectedPresets([]);
                  else setSelectedPresets(available);
                }}
              >
                {selectedPresets.length === presets.filter(p => p.requires).length ? "Deselect all" : "Select all"}
              </button>
              <Button onClick={handleBulkAdd} disabled={selectedPresets.length === 0 || bulkCreate.isPending}>
                {bulkCreate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add {selectedPresets.length} Task{selectedPresets.length !== 1 ? "s" : ""}
              </Button>
            </div>
            </>
            )}
          </TabsContent>
          
          <TabsContent value="custom">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitCustom)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Task Name *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {PRESET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl><Textarea className="resize-none" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={createCustomTask.isPending}>
                    {createCustomTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Custom Task
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
