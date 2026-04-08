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
  getListTasksQueryKey,
  getGetShowQueryKey,
  Show
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  CheckCircle2, Circle, Clock, Edit2, Trash2, 
  Plus, Calendar as CalendarIcon, MessageSquare, AlertCircle,
  ChevronDown, ChevronUp, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { getUrgencyInfo, getCategoryColor, formatDate, subBusinessDays, addBusinessDays } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";

const PRESET_CATEGORIES = [
  "Fire Marshal",
  "ID Sign",
  "Warehouse Manifest",
  "Show Bucket",
  "Vehicle Spotting",
  "Electrical"
];

export function TaskList({ show }: { show: Show }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tasks, isLoading } = useListTasks(show.id);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [completedOpen, setCompletedOpen] = useState(false);

  const groupedTasks = useMemo(() => {
    if (!tasks) return { overdue: [], upcoming: [], completed: [] };
    
    const today = startOfDay(new Date());
    const overdue = [];
    const upcoming = [];
    const completed = [];

    for (const t of tasks) {
      if (t.completed) {
        completed.push(t);
        continue;
      }
      
      if (t.dueDate) {
        const dueDate = startOfDay(new Date(t.dueDate));
        if (differenceInDays(dueDate, today) < 0) {
          overdue.push(t);
        } else {
          upcoming.push(t);
        }
      } else {
        upcoming.push(t);
      }
    }

    upcoming.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    overdue.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
    
    completed.sort((a, b) => {
      if (!a.completedAt) return 1;
      if (!b.completedAt) return -1;
      return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
    });

    return { overdue, upcoming, completed };
  }, [tasks]);

  const toggleTask = (taskId: number, currentCompleted: boolean) => {
    updateTask.mutate({ 
      showId: show.id,
      taskId,
      data: { completed: !currentCompleted } 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
      }
    });
  };

  const removeTask = (taskId: number) => {
    deleteTask.mutate({ showId: show.id, taskId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
      }
    });
  };

  if (isLoading) {
    return <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold tracking-tight">Tasks</h3>
        <AddTaskDialog show={show} />
      </div>

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
      
      {groupedTasks.upcoming.length === 0 && groupedTasks.overdue.length === 0 && (
        <div className="text-center py-10 border-2 border-dashed rounded-lg text-muted-foreground">
          No pending tasks.
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
  );
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
  const urgency = getUrgencyInfo(task.dueDate);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateTask = useUpdateTask();

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
    <div className={`group flex flex-col p-3 rounded-lg border bg-card transition-colors ${task.completed ? 'opacity-60' : 'hover:border-primary/30'}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={task.completed}
          onCheckedChange={onToggle}
          className={`mt-1 ${task.completed ? 'data-[state=checked]:bg-green-500 data-[state=checked]:text-white border-green-500' : ''}`}
        />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
              {task.name}
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
              <div className="flex items-center gap-1 font-medium text-green-500">
                <CheckCircle2 className="h-3 w-3" />
                Done {format(new Date(task.completedAt), "MMM d, yyyy")}
              </div>
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
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEdit}>
                <Edit2 className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Edit Task</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-4">
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
                    name="dueDateRule"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due Date Rule</FormLabel>
                        <FormControl><Input placeholder="e.g. 30 cal days before move-in" {...field} /></FormControl>
                      </FormItem>
                    )}
                  />
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

          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
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
    createCustomTask.mutate({ showId: show.id, data }, {
      onSuccess: () => {
        toast({ title: "Task added" });
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
      }
    });
  };

  // Preset tasks logic
  const mi = new Date(show.moveInDate);
  const aw = show.advanceWarehouseDate ? new Date(show.advanceWarehouseDate as string) : null;
  const ood = show.onlineOrderDeadline ? new Date(show.onlineOrderDeadline as string) : null;

  const presets: { cat: string; name: string; requires: unknown; date: string; rule: string }[] = [
    // ── Fire Marshal / Floor Plan ──────────────────────────────────────
    { cat: "Fire Marshal", name: "Initial Contact Account Executive", requires: show.moveInDate, date: format(subDays(mi, 60), "yyyy-MM-dd"), rule: "60 cal days before move-in" },
    { cat: "Fire Marshal", name: "Check In / Submit", requires: show.moveInDate, date: format(subBusinessDays(mi, 30), "yyyy-MM-dd"), rule: "30 biz days before move-in" },
    { cat: "Fire Marshal", name: "Hard Deadline", requires: show.moveInDate, date: format(subDays(mi, 30), "yyyy-MM-dd"), rule: "30 cal days before move-in" },

    // ── ID Sign Production ─────────────────────────────────────────────
    { cat: "ID Sign", name: "Contact Client / Give Deadline", requires: show.moveInDate, date: format(subDays(mi, 30), "yyyy-MM-dd"), rule: "30 cal days before move-in" },
    { cat: "ID Sign", name: "ID Sign Deadline", requires: show.moveInDate, date: format(subBusinessDays(mi, 12), "yyyy-MM-dd"), rule: "12 biz days before move-in" },
    { cat: "ID Sign", name: "Submit Order", requires: show.moveInDate, date: format(subBusinessDays(mi, 8), "yyyy-MM-dd"), rule: "8 biz days before move-in" },

    // ── Warehouse Manifest ─────────────────────────────────────────────
    { cat: "Warehouse Manifest", name: "Contact Declared but Not Received", requires: show.advanceWarehouseDate, date: aw ? format(subBusinessDays(aw, 3), "yyyy-MM-dd") : "", rule: "3 biz days before Advance Warehouse" },

    // ── Show Bucket ────────────────────────────────────────────────────
    { cat: "Show Bucket", name: "Get Bucket Due Dates & Quantities", requires: show.moveInDate, date: format(subBusinessDays(mi, 10), "yyyy-MM-dd"), rule: "10 biz days before move-in" },
    { cat: "Show Bucket", name: "Create Carpet Plan", requires: show.onlineOrderDeadline, date: ood ? format(addDays(ood, 1), "yyyy-MM-dd") : "", rule: "1 cal day after Online Order Deadline" },
    { cat: "Show Bucket", name: "Add CC Tags to XBR List", requires: show.moveInDate, date: format(subBusinessDays(mi, 5), "yyyy-MM-dd"), rule: "5 biz days before move-in" },
    { cat: "Show Bucket", name: "Finalize Carpet Plan", requires: show.moveInDate, date: format(subBusinessDays(mi, 5), "yyyy-MM-dd"), rule: "5 biz days before move-in" },
    { cat: "Show Bucket", name: "Begin Bucket Creation", requires: show.moveInDate, date: format(subBusinessDays(mi, 5), "yyyy-MM-dd"), rule: "5 biz days before move-in" },
    { cat: "Show Bucket", name: "Bucket Due Date", requires: true, date: "", rule: "Manual entry — set due date after adding" },

    // ── Vehicle Spotting ───────────────────────────────────────────────
    { cat: "Vehicle Spotting", name: "Send e-Blast for A.E. Vehicle Spotting", requires: show.moveInDate, date: format(subDays(mi, 60), "yyyy-MM-dd"), rule: "60 cal days before move-in" },
    { cat: "Vehicle Spotting", name: "Check Vehicle Spotting / Provide To Beau", requires: show.moveInDate, date: format(subDays(mi, 40), "yyyy-MM-dd"), rule: "40 cal days before move-in" },
    { cat: "Vehicle Spotting", name: "Check Vehicle Spotting / Provide To Beau 2", requires: show.moveInDate, date: format(subBusinessDays(mi, 30), "yyyy-MM-dd"), rule: "30 biz days before move-in" },

    // ── Electrical ─────────────────────────────────────────────────────
    { cat: "Electrical", name: "Contact Electrical Provider", requires: show.onlineOrderDeadline, date: ood ? format(addDays(ood, 1), "yyyy-MM-dd") : "", rule: "1 cal day after Online Order Deadline" },
  ];

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
            <div className="border rounded-md max-h-[420px] overflow-y-auto">
              {(() => {
                const rows: React.ReactNode[] = [];
                let lastCat = "";
                presets.forEach((p, idx) => {
                  if (p.cat !== lastCat) {
                    lastCat = p.cat;
                    rows.push(
                      <div key={`hdr-${p.cat}`} className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest sticky top-0 ${getCategoryColor(p.cat)} bg-opacity-20 border-b`}>
                        {p.cat}
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
                        <span className="font-medium text-sm block">{p.name}</span>
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
