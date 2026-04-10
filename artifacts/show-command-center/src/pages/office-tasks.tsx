import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListOfficeTasks,
  useCreateOfficeTask,
  useUpdateOfficeTask,
  useDeleteOfficeTask,
  getListOfficeTasksQueryKey,
  OfficeTask,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Edit2, Trash2, Loader2, Calendar as CalendarIcon, Search, ArrowUpDown, StickyNote, X, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const STATUSES = ["todo", "inprogress", "completed"] as const;

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  inprogress: "In Progress",
  completed: "Completed",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "urgent": return "bg-red-500/20 text-red-500 border-red-500/30";
    case "high": return "bg-orange-500/20 text-orange-500 border-orange-500/30";
    case "medium": return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
    case "low": return "bg-green-500/20 text-green-500 border-green-500/30";
    default: return "bg-gray-500/20 text-gray-500 border-gray-500/30";
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "completed": return "bg-green-500/20 text-green-500 border-green-500/30";
    case "inprogress": return "bg-blue-500/20 text-blue-500 border-blue-500/30";
    case "todo": return "bg-gray-500/20 text-gray-500 border-gray-500/30";
    default: return "bg-gray-500/20 text-gray-500 border-gray-500/30";
  }
};

const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.string().default("medium"),
  status: z.string().default("todo"),
  category: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

type SortOption = "dueDate" | "priority" | "createdAt";
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export default function OfficeTasks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("createdAt");
  const [createOpen, setCreateOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);

  const { data: tasks, isLoading } = useListOfficeTasks();
  const createTask = useCreateOfficeTask();
  const updateTask = useUpdateOfficeTask();
  const deleteTask = useDeleteOfficeTask();

  const categories = useMemo(() => {
    if (!tasks) return [];
    const cats = [...new Set(tasks.map(t => t.category).filter(Boolean))] as string[];
    return cats.sort();
  }, [tasks]);

  const filteredAndSorted = useMemo(() => {
    if (!tasks) return [];

    let result = tasks.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === "dueDate") {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (sortBy === "priority") {
        return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [tasks, search, filterStatus, filterPriority, filterCategory, sortBy]);

  const createForm = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: { title: "", notes: "", dueDate: "", priority: "medium", status: "todo", category: "" },
  });

  const handleCreate = (data: TaskFormValues) => {
    createTask.mutate(
      {
        data: {
          title: data.title,
          notes: data.notes || null,
          dueDate: data.dueDate || null,
          priority: data.priority,
          status: data.status,
          category: data.category || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Task created" });
          setCreateOpen(false);
          createForm.reset({ title: "", notes: "", dueDate: "", priority: "medium", status: "todo", category: "" });
          queryClient.invalidateQueries({ queryKey: getListOfficeTasksQueryKey() });
        },
        onError: () => toast({ title: "Failed to create task", variant: "destructive" }),
      }
    );
  };

  const handleToggle = (task: OfficeTask) => {
    updateTask.mutate(
      { taskId: task.id, data: { completed: !task.completed } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOfficeTasksQueryKey() }),
        onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (taskId: number) => {
    deleteTask.mutate(
      { taskId },
      {
        onSuccess: () => {
          toast({ title: "Task deleted" });
          queryClient.invalidateQueries({ queryKey: getListOfficeTasksQueryKey() });
        },
        onError: () => toast({ title: "Failed to delete task", variant: "destructive" }),
      }
    );
  };

  const totalCount = tasks?.length ?? 0;
  const completedCount = tasks?.filter(t => t.completed).length ?? 0;

  return (
    <Layout>
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex gap-6 items-start">

        {/* Main task area */}
        <div className="flex-1 min-w-0 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Office Tasks</h1>
            <p className="text-muted-foreground mt-1">
              {completedCount} of {totalCount} completed
            </p>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Create Office Task</DialogTitle>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title *</FormLabel>
                        <FormControl><Input placeholder="Task title" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {PRIORITIES.map(p => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category / Label</FormLabel>
                          <FormControl><Input placeholder="e.g. Admin" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={createForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl><Textarea className="resize-none" rows={3} placeholder="Optional details..." {...field} /></FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createTask.isPending}>
                      {createTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              className="pl-8"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              {PRIORITIES.map(p => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          {categories.length > 0 && (
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={sortBy} onValueChange={val => setSortBy(val as SortOption)}>
            <SelectTrigger className="w-[160px]">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Date Created</SelectItem>
              <SelectItem value="dueDate">Due Date</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Task List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-xl text-muted-foreground">
            {tasks?.length === 0 ? "No office tasks yet. Create your first task!" : "No tasks match your filters."}
          </div>
        ) : (() => {
          const activeTasks = filteredAndSorted.filter(t => !t.completed);
          const completedTasks = filteredAndSorted.filter(t => t.completed);

          // If no active tasks (e.g. filter set to "Completed"), show all flat
          if (activeTasks.length === 0) {
            return (
              <div className="space-y-2">
                {completedTasks.map(task => (
                  <OfficeTaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => handleToggle(task)}
                    onDelete={() => handleDelete(task.id)}
                  />
                ))}
              </div>
            );
          }

          return (
            <div className="space-y-2">
              {activeTasks.map(task => (
                <OfficeTaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => handleToggle(task)}
                  onDelete={() => handleDelete(task.id)}
                />
              ))}

              {completedTasks.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setCompletedOpen(o => !o)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2 border-t"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="font-medium">{completedTasks.length} Completed</span>
                    {completedOpen
                      ? <ChevronUp className="h-4 w-4 ml-auto" />
                      : <ChevronDown className="h-4 w-4 ml-auto" />
                    }
                  </button>

                  {completedOpen && (
                    <div className="space-y-2 mt-2">
                      {completedTasks.map(task => (
                        <OfficeTaskRow
                          key={task.id}
                          task={task}
                          onToggle={() => handleToggle(task)}
                          onDelete={() => handleDelete(task.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
        </div>

        {/* Sticky Notes Sidebar */}
        <div className="w-72 shrink-0 hidden lg:block">
          <StickyNotesWidget />
        </div>

        </div>
      </div>
    </Layout>
  );
}

function OfficeTaskRow({ task, onToggle, onDelete }: { task: OfficeTask; onToggle: () => void; onDelete: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateTask = useUpdateOfficeTask();

  const editForm = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: task.title,
      notes: task.notes ?? "",
      dueDate: task.dueDate ? String(task.dueDate).split("T")[0] : "",
      priority: task.priority,
      status: task.status,
      category: task.category ?? "",
    },
  });

  const openEdit = () => {
    editForm.reset({
      title: task.title,
      notes: task.notes ?? "",
      dueDate: task.dueDate ? String(task.dueDate).split("T")[0] : "",
      priority: task.priority,
      status: task.status,
      category: task.category ?? "",
    });
    setEditOpen(true);
  };

  const handleEdit = (data: TaskFormValues) => {
    updateTask.mutate(
      {
        taskId: task.id,
        data: {
          title: data.title,
          notes: data.notes || null,
          dueDate: data.dueDate || null,
          priority: data.priority,
          status: data.status,
          category: data.category || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Task updated" });
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: getListOfficeTasksQueryKey() });
        },
        onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
      }
    );
  };

  return (
    <div className={`group flex items-start gap-3 p-4 rounded-lg border bg-card transition-colors hover:border-primary/30 ${task.completed ? "opacity-60" : ""}`}>
      <Checkbox
        checked={task.completed}
        onCheckedChange={onToggle}
        className={`mt-0.5 ${task.completed ? "data-[state=checked]:bg-green-500 data-[state=checked]:text-white border-green-500" : ""}`}
      />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}>
            {task.title}
          </span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${getPriorityColor(task.priority)}`}>
            {PRIORITY_LABELS[task.priority] ?? task.priority}
          </Badge>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${getStatusColor(task.status)}`}>
            {STATUS_LABELS[task.status] ?? task.status}
          </Badge>
          {task.category && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {task.category}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
          {task.dueDate && (
            <div className="flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {format(new Date(task.dueDate + "T00:00:00"), "MMM d, yyyy")}
            </div>
          )}
          {task.completedAt && (
            <span className="text-green-500">
              Done {format(new Date(task.completedAt), "MMM d, yyyy")}
            </span>
          )}
          {task.notes && (
            <span className="italic truncate max-w-[300px]">{task.notes}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEdit}>
              <Edit2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit Office Task</DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {PRIORITIES.map(p => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category / Label</FormLabel>
                        <FormControl><Input placeholder="e.g. Admin" {...field} /></FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={editForm.control}
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

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Task</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{task.title}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ── Sticky Notes Widget ────────────────────────────────────────────────────

type StickyNote = {
  id: string;
  text: string;
  color: string;
  createdAt: number;
};

const NOTE_COLORS: { bg: string; dot: string; label: string }[] = [
  { bg: "bg-yellow-400/20 border-yellow-400/40", dot: "bg-yellow-400", label: "Yellow" },
  { bg: "bg-blue-400/20 border-blue-400/40",     dot: "bg-blue-400",   label: "Blue"   },
  { bg: "bg-green-400/20 border-green-400/40",   dot: "bg-green-400",  label: "Green"  },
  { bg: "bg-pink-400/20 border-pink-400/40",     dot: "bg-pink-400",   label: "Pink"   },
  { bg: "bg-purple-400/20 border-purple-400/40", dot: "bg-purple-400", label: "Purple" },
  { bg: "bg-orange-400/20 border-orange-400/40", dot: "bg-orange-400", label: "Orange" },
  { bg: "bg-teal-400/20 border-teal-400/40",     dot: "bg-teal-400",   label: "Teal"   },
];

const STORAGE_KEY = "office-sticky-notes";

function StickyNotesWidget() {
  const [notes, setNotes] = useState<StickyNote[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const saveNotes = useCallback((updated: StickyNote[]) => {
    setNotes(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }, []);

  const addNote = () => {
    const color = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)].bg;
    const newNote: StickyNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text: "",
      color,
      createdAt: Date.now(),
    };
    saveNotes([newNote, ...notes]);
  };

  const updateNote = (id: string, text: string) => {
    saveNotes(notes.map(n => n.id === id ? { ...n, text } : n));
  };

  const recolorNote = (id: string, color: string) => {
    saveNotes(notes.map(n => n.id === id ? { ...n, color } : n));
  };

  const deleteNote = (id: string) => {
    saveNotes(notes.filter(n => n.id !== id));
  };

  return (
    <div className="sticky top-20 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <StickyNote className="h-3.5 w-3.5" />
          Quick Notes
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addNote} title="Add note">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {notes.length === 0 && (
        <button
          onClick={addNote}
          className="w-full text-center py-8 border-2 border-dashed rounded-xl text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors text-sm"
        >
          <StickyNote className="h-5 w-5 mx-auto mb-2 opacity-50" />
          Click + to add a note
        </button>
      )}

      <div className="space-y-3 max-h-[calc(100vh-140px)] overflow-y-auto pr-0.5">
        {notes.map(note => (
          <StickyNoteCard
            key={note.id}
            note={note}
            onChange={text => updateNote(note.id, text)}
            onColorChange={color => recolorNote(note.id, color)}
            onDelete={() => deleteNote(note.id)}
          />
        ))}
      </div>
    </div>
  );
}

function StickyNoteCard({ note, onChange, onColorChange, onDelete }: {
  note: StickyNote;
  onChange: (text: string) => void;
  onColorChange: (color: string) => void;
  onDelete: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onChange(val), 400);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, []);

  return (
    <div className={`group relative rounded-xl border p-3 transition-shadow hover:shadow-md ${note.color}`}>
      {/* Delete button */}
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-background/60 hover:bg-destructive/20 hover:text-destructive text-muted-foreground"
        title="Delete note"
      >
        <X className="h-3 w-3" />
      </button>

      {/* Note text */}
      <textarea
        ref={textareaRef}
        className="w-full bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground/60 leading-relaxed pr-5"
        placeholder="Jot something down..."
        defaultValue={note.text}
        onChange={handleChange}
        rows={3}
      />

      {/* Color swatches — appear on hover at the bottom */}
      <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {NOTE_COLORS.map(c => (
          <button
            key={c.label}
            title={c.label}
            onClick={() => onColorChange(c.bg)}
            className={`h-3.5 w-3.5 rounded-full ${c.dot} ring-offset-1 transition-transform hover:scale-125 ${note.color === c.bg ? "ring-2 ring-foreground/60" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
