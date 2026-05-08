import React, { useState, useMemo } from "react";
import { format, differenceInDays, startOfDay, subDays } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useListEblasts, 
  useUpdateEblast, 
  useDeleteEblast, 
  useCreateEblast,
  useBulkCreateEblasts,
  getListEblastsQueryKey,
  getGetShowQueryKey,
  Show
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  CheckCircle2, Clock, Trash2, Edit2,
  Plus, Calendar as CalendarIcon, MessageSquare,
  ChevronDown, ChevronUp, Loader2, Mail
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getUrgencyInfo, formatDate, parseDateStr, subBusinessDays } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";

export function EblastList({ show }: { show: Show }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: eblasts, isLoading } = useListEblasts(show.id);
  const updateEblast = useUpdateEblast();
  const deleteEblast = useDeleteEblast();

  const [sentOpen, setSentOpen] = useState(false);

  const grouped = useMemo(() => {
    if (!eblasts) return { overdue: [], upcoming: [], sent: [] };
    
    const today = startOfDay(new Date());
    const overdue = [];
    const upcoming = [];
    const sent = [];

    for (const e of eblasts) {
      if (e.sent) {
        sent.push(e);
        continue;
      }
      
      if (e.dueDate) {
        const dueDate = startOfDay(parseDateStr(e.dueDate));
        if (differenceInDays(dueDate, today) < 0) {
          overdue.push(e);
        } else {
          upcoming.push(e);
        }
      } else {
        upcoming.push(e);
      }
    }

    upcoming.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return parseDateStr(a.dueDate).getTime() - parseDateStr(b.dueDate).getTime();
    });

    overdue.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return parseDateStr(a.dueDate).getTime() - parseDateStr(b.dueDate).getTime();
    });
    
    sent.sort((a, b) => {
      if (!a.sentAt) return 1;
      if (!b.sentAt) return -1;
      return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
    });

    return { overdue, upcoming, sent };
  }, [eblasts]);

  const toggleStatus = (id: number, currentSent: boolean) => {
    updateEblast.mutate({ 
      showId: show.id,
      eblastId: id,
      data: { sent: !currentSent } 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEblastsQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
      }
    });
  };

  const remove = (id: number) => {
    deleteEblast.mutate({ showId: show.id, eblastId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEblastsQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
      }
    });
  };

  if (isLoading) {
    return <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold tracking-tight text-pink-500">eBlasts</h3>
        <AddEblastDialog show={show} />
      </div>

      {grouped.overdue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-red-500 font-semibold uppercase tracking-wider text-sm">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </div>
            Overdue
          </div>
          <div className="grid gap-2 border-red-500/20 border rounded-lg p-2 bg-red-500/5">
            {grouped.overdue.map(e => (
              <EblastRow key={e.id} item={e} showId={show.id} onToggle={() => toggleStatus(e.id, e.sent)} onDelete={() => remove(e.id)} />
            ))}
          </div>
        </div>
      )}

      {grouped.upcoming.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-muted-foreground font-semibold uppercase tracking-wider text-sm">
            <Clock className="h-4 w-4" />
            Upcoming
          </div>
          <div className="grid gap-2">
            {grouped.upcoming.map(e => (
              <EblastRow key={e.id} item={e} showId={show.id} onToggle={() => toggleStatus(e.id, e.sent)} onDelete={() => remove(e.id)} />
            ))}
          </div>
        </div>
      )}
      
      {grouped.upcoming.length === 0 && grouped.overdue.length === 0 && (
        <div className="text-center py-10 border-2 border-dashed rounded-lg text-muted-foreground">
          No pending eBlasts.
        </div>
      )}

      {grouped.sent.length > 0 && (
        <Collapsible open={sentOpen} onOpenChange={setSentOpen} className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-pink-500 font-semibold uppercase tracking-wider text-sm">
              <Mail className="h-4 w-4" />
              Sent
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {sentOpen ? "Hide" : "Show"} ({grouped.sent.length})
                {sentOpen ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="space-y-2 opacity-75">
            {grouped.sent.map(e => (
              <EblastRow key={e.id} item={e} showId={show.id} onToggle={() => toggleStatus(e.id, e.sent)} onDelete={() => remove(e.id)} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

const editEblastSchema = z.object({
  name: z.string().min(1, "Name is required"),
  dueDate: z.string().optional(),
  dueDateRule: z.string().optional(),
  notes: z.string().optional(),
});

function EblastRow({ item, showId, onToggle, onDelete }: { item: any, showId: number, onToggle: () => void, onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const urgency = getUrgencyInfo(item.dueDate);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateEblast = useUpdateEblast();

  const onUpdateSentAt = (dateStr: string) => {
    if (!dateStr) return;
    updateEblast.mutate(
      { showId, eblastId: item.id, data: { sentAt: new Date(dateStr).toISOString() } as any },
      {
        onSuccess: () => {
          toast({ title: "Sent date updated" });
          setDatePickerOpen(false);
          queryClient.invalidateQueries({ queryKey: getListEblastsQueryKey(showId) });
        },
        onError: () => toast({ title: "Error updating date", variant: "destructive" }),
      }
    );
  };

  const form = useForm<z.infer<typeof editEblastSchema>>({
    resolver: zodResolver(editEblastSchema),
    defaultValues: {
      name: item.name,
      dueDate: item.dueDate ? String(item.dueDate).split("T")[0] : "",
      dueDateRule: item.dueDateRule ?? "",
      notes: item.notes ?? "",
    },
  });

  const openEdit = () => {
    form.reset({
      name: item.name,
      dueDate: item.dueDate ? String(item.dueDate).split("T")[0] : "",
      dueDateRule: item.dueDateRule ?? "",
      notes: item.notes ?? "",
    });
    setEditOpen(true);
  };

  const onEditSubmit = (data: z.infer<typeof editEblastSchema>) => {
    updateEblast.mutate(
      { showId, eblastId: item.id, data },
      {
        onSuccess: () => {
          toast({ title: "eBlast updated" });
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: getListEblastsQueryKey(showId) });
          queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(showId) });
        },
        onError: () => toast({ title: "Error updating eBlast", variant: "destructive" }),
      }
    );
  };

  return (
    <div className={`group flex flex-col p-3 rounded-lg border bg-card transition-colors ${item.sent ? 'opacity-60' : 'hover:border-pink-500/30'}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={item.sent}
          onCheckedChange={onToggle}
          className={`mt-1 ${item.sent ? 'data-[state=checked]:bg-pink-500 data-[state=checked]:text-white border-pink-500' : ''}`}
        />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-medium ${item.sent ? 'line-through text-muted-foreground' : ''}`}>
              {item.name}
            </span>
            {item.notes && !expanded && (
              <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground" onClick={() => setExpanded(true)}>
                <MessageSquare className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs">
            {item.sent && item.sentAt ? (
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 font-medium text-pink-500 hover:text-pink-400 hover:underline cursor-pointer">
                    <Mail className="h-3 w-3" />
                    Sent {format(new Date(item.sentAt), "MMM d, yyyy")}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  <p className="text-xs text-muted-foreground mb-2">Adjust sent date</p>
                  <input
                    type="date"
                    defaultValue={format(new Date(item.sentAt), "yyyy-MM-dd")}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    onChange={(e) => onUpdateSentAt(e.target.value)}
                  />
                </PopoverContent>
              </Popover>
            ) : item.dueDate ? (
              <div className={`flex items-center gap-1 font-medium ${urgency.textClass}`}>
                <CalendarIcon className="h-3 w-3" />
                {formatDate(item.dueDate)}
                {urgency.daysRemaining !== null && (
                  <span className="ml-1 opacity-80">
                    ({Math.abs(urgency.daysRemaining)}d {urgency.daysRemaining < 0 ? 'ago' : 'left'})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">No due date</span>
            )}
            {item.dueDateRule && (
              <span className="text-muted-foreground italic border-l pl-3">
                {item.dueDateRule}
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
            <DialogContent className="max-w-md border-pink-500/20" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle className="text-pink-500 flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Edit eBlast
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>eBlast Name *</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
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
                    <FormField
                      control={form.control}
                      name="dueDateRule"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date Rule</FormLabel>
                          <FormControl><Input placeholder="e.g. 7 days before..." {...field} /></FormControl>
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
                        <FormControl><Textarea className="resize-none" rows={3} {...field} /></FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" type="button" onClick={() => setEditOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={updateEblast.isPending} className="bg-pink-600 hover:bg-pink-700">
                      {updateEblast.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                <AlertDialogTitle>Delete eBlast?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{item.name}"? This cannot be undone.
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

      {expanded && item.notes && (
        <div className="mt-3 ml-7 p-3 bg-muted/30 rounded-md text-sm border border-border/50 whitespace-pre-wrap">
          <div className="flex justify-between items-start gap-2">
            <span>{item.notes}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-muted-foreground" onClick={() => setExpanded(false)}>
              <ChevronUp className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddEblastDialog({ show }: { show: Show }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createCustom = useCreateEblast();
  const bulkCreate = useBulkCreateEblasts();

  const customSchema = z.object({
    name: z.string().min(1, "Name is required"),
    dueDate: z.string().optional(),
    notes: z.string().optional()
  });

  const form = useForm<z.infer<typeof customSchema>>({
    resolver: zodResolver(customSchema),
    defaultValues: { name: "", dueDate: "", notes: "" }
  });

  const onSubmitCustom = (data: z.infer<typeof customSchema>) => {
    const cleaned = {
      name: data.name,
      ...(data.dueDate ? { dueDate: data.dueDate } : {}),
      ...(data.notes ? { notes: data.notes } : {}),
    };
    createCustom.mutate({ showId: show.id, data: cleaned as any }, {
      onSuccess: () => {
        toast({ title: "eBlast added" });
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListEblastsQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
      }
    });
  };

  const presets = [
    { name: "Exhibitor Kit Sent", requires: true, date: "", rule: "" },
    { name: "Bi-Weekly eBlast", requires: true, date: "", rule: "" },
    { name: "Discount Deadline eBlast #1", requires: show.discountDeadline, get date() { return format(subDays(parseDateStr(show.discountDeadline!), 7), "yyyy-MM-dd"); }, rule: "7 cal days before Discount Deadline" },
    { name: "Discount Deadline eBlast #2", requires: show.discountDeadline, get date() { return format(subDays(parseDateStr(show.discountDeadline!), 3), "yyyy-MM-dd"); }, rule: "3 cal days before Discount Deadline" },
    { name: "Online Order Deadline eBlast #1", requires: show.onlineOrderDeadline, get date() { return format(subDays(parseDateStr(show.onlineOrderDeadline!), 7), "yyyy-MM-dd"); }, rule: "7 cal days before Online Order Deadline" },
    { name: "Online Order Deadline eBlast #2", requires: show.onlineOrderDeadline, get date() { return format(subDays(parseDateStr(show.onlineOrderDeadline!), 3), "yyyy-MM-dd"); }, rule: "3 cal days before Online Order Deadline" },
  ];

  const [selectedPresets, setSelectedPresets] = useState<number[]>([]);

  const togglePreset = (idx: number) => {
    if (selectedPresets.includes(idx)) setSelectedPresets(selectedPresets.filter(i => i !== idx));
    else setSelectedPresets([...selectedPresets, idx]);
  };

  const submitPresets = (indexes: number[]) => {
    const eblasts = indexes.map(idx => {
      const p = presets[idx];
      return { name: p.name, dueDate: p.date || undefined, dueDateRule: p.rule || undefined };
    });
    bulkCreate.mutate({ showId: show.id, data: { eblasts } }, {
      onSuccess: () => {
        toast({ title: `${eblasts.length} eBlast${eblasts.length !== 1 ? "s" : ""} added` });
        setOpen(false);
        setSelectedPresets([]);
        queryClient.invalidateQueries({ queryKey: getListEblastsQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
      }
    });
  };

  const handleBulkAdd = () => submitPresets(selectedPresets);

  const handleAddAll = () => {
    const available = presets.map((_, i) => i).filter(i => presets[i].requires);
    submitPresets(available);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-pink-600 hover:bg-pink-700 text-white"><Plus className="mr-2 h-4 w-4" /> Add eBlast</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl border-pink-500/30" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-pink-500 flex items-center gap-2"><Mail className="h-5 w-5"/> Add eBlasts</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="preset">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="preset">Preset Schedule</TabsTrigger>
            <TabsTrigger value="custom">Custom eBlast</TabsTrigger>
          </TabsList>
          
          <TabsContent value="preset" className="space-y-4">
            <div className="grid gap-2 border rounded-md p-4 max-h-[400px] overflow-y-auto">
              {presets.map((p, idx) => (
                <div key={idx} className={`flex items-start gap-3 p-3 rounded-md border ${!p.requires ? 'opacity-50 bg-muted/50' : 'hover:bg-accent cursor-pointer'}`} onClick={() => p.requires && togglePreset(idx)}>
                  <Checkbox checked={selectedPresets.includes(idx)} disabled={!p.requires} className="data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500" />
                  <div>
                    <div className="font-medium text-sm text-foreground">{p.name}</div>
                    {p.rule && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {p.requires ? `${formatDate(p.date)} (${p.rule})` : 'Missing required show dates'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2">
              <Button variant="outline" size="sm" onClick={() => {
                const available = presets.map((_, i) => i).filter(i => presets[i].requires);
                if (selectedPresets.length === available.length) setSelectedPresets([]);
                else setSelectedPresets(available);
              }}>
                {selectedPresets.length === presets.filter(p => p.requires).length ? "Deselect All" : "Select All"}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleAddAll} disabled={bulkCreate.isPending} className="border-pink-600 text-pink-500 hover:bg-pink-600 hover:text-white">
                  {bulkCreate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add All
                </Button>
                <Button onClick={handleBulkAdd} disabled={selectedPresets.length === 0 || bulkCreate.isPending} className="bg-pink-600 hover:bg-pink-700">
                  {bulkCreate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add {selectedPresets.length} eBlasts
                </Button>
              </div>
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
                      <FormLabel>eBlast Name *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
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
                  <Button type="submit" disabled={createCustom.isPending} className="bg-pink-600 hover:bg-pink-700">
                    {createCustom.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Custom eBlast
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
