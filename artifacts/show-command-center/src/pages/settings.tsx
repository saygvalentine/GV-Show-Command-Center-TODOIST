import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPresetTasks,
  useCreatePresetTask,
  useUpdatePresetTask,
  useDeletePresetTask,
  getListPresetTasksQueryKey,
  PresetTask,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Plus, Edit2, Trash2, Check, X, Loader2, ChevronDown, ChevronRight, Star } from "lucide-react";
import { getCategoryColor } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { GoogleCalendarSettings } from "@/components/google-calendar-settings";
import { isKeyTask } from "@/components/task-list";

const PRESET_CATEGORIES = [
  "Fire Marshal",
  "ID Sign",
  "Warehouse Manifest",
  "Show Bucket",
  "Vehicle Spotting",
  "Electrical",
];

const ANCHOR_OPTIONS = [
  { value: "moveInDate", label: "Move-in Date" },
  { value: "advanceWarehouseDate", label: "Advance Warehouse Date" },
  { value: "onlineOrderDeadline", label: "Online Order Deadline" },
];

const ANCHOR_DISPLAY: Record<string, string> = {
  moveInDate: "move-in",
  advanceWarehouseDate: "Advance Warehouse",
  onlineOrderDeadline: "Online Order Deadline",
};

function ruleLabel(preset: PresetTask): string {
  if (!preset.dueDateOffset) return "Manual entry";
  const anchor = ANCHOR_DISPLAY[preset.dueDateAnchor!] ?? preset.dueDateAnchor ?? "";
  return `${preset.dueDateOffset} ${preset.dueDateUnit} days ${preset.dueDateDirection} ${anchor}`;
}

interface PresetFormState {
  name: string;
  category: string;
  dueDateOffset: string;
  dueDateUnit: string;
  dueDateDirection: string;
  dueDateAnchor: string;
}

const emptyForm = (category: string): PresetFormState => ({
  name: "",
  category,
  dueDateOffset: "",
  dueDateUnit: "cal",
  dueDateDirection: "before",
  dueDateAnchor: "moveInDate",
});

function presetToForm(preset: PresetTask): PresetFormState {
  return {
    name: preset.name,
    category: preset.category,
    dueDateOffset: preset.dueDateOffset != null ? String(preset.dueDateOffset) : "",
    dueDateUnit: preset.dueDateUnit ?? "cal",
    dueDateDirection: preset.dueDateDirection ?? "before",
    dueDateAnchor: preset.dueDateAnchor ?? "moveInDate",
  };
}

function formToPayload(form: PresetFormState) {
  const offset = form.dueDateOffset.trim() ? parseInt(form.dueDateOffset, 10) : null;
  return {
    name: form.name.trim(),
    category: form.category,
    dueDateOffset: offset,
    dueDateUnit: offset != null ? form.dueDateUnit : null,
    dueDateDirection: offset != null ? form.dueDateDirection : null,
    dueDateAnchor: offset != null ? form.dueDateAnchor : null,
  };
}

function PresetForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  isPending,
}: {
  form: PresetFormState;
  onChange: (f: PresetFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const hasOffset = form.dueDateOffset.trim() !== "";
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30">
      <Input
        placeholder="Task name *"
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        className="h-8 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Offset (days)"
          type="number"
          min={1}
          value={form.dueDateOffset}
          onChange={(e) => onChange({ ...form, dueDateOffset: e.target.value })}
          className="h-8 text-sm w-32"
        />
        {hasOffset && (
          <>
            <Select value={form.dueDateUnit} onValueChange={(v) => onChange({ ...form, dueDateUnit: v })}>
              <SelectTrigger className="h-8 text-sm w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cal">Cal</SelectItem>
                <SelectItem value="biz">Biz</SelectItem>
              </SelectContent>
            </Select>
            <Select value={form.dueDateDirection} onValueChange={(v) => onChange({ ...form, dueDateDirection: v })}>
              <SelectTrigger className="h-8 text-sm w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="before">Before</SelectItem>
                <SelectItem value="after">After</SelectItem>
              </SelectContent>
            </Select>
            <Select value={form.dueDateAnchor} onValueChange={(v) => onChange({ ...form, dueDateAnchor: v })}>
              <SelectTrigger className="h-8 text-sm w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANCHOR_OPTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>
      {!hasOffset && (
        <p className="text-xs text-muted-foreground">Leave offset blank for manual date entry.</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={onSubmit} disabled={isPending || !form.name.trim()}>
          {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          <Check className="mr-1 h-3 w-3" /> Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" /> Cancel
        </Button>
      </div>
    </div>
  );
}

function CategorySection({
  category,
  presets,
}: {
  category: string;
  presets: PresetTask[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createPreset = useCreatePresetTask();
  const updatePreset = useUpdatePresetTask();
  const deletePreset = useDeletePresetTask();

  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<PresetFormState>(emptyForm(category));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PresetFormState>(emptyForm(category));

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListPresetTasksQueryKey() });

  const handleAdd = () => {
    const payload = formToPayload(addForm);
    if (!payload.name) return;
    createPreset.mutate({ data: payload }, {
      onSuccess: () => {
        toast({ title: "Preset added" });
        setAdding(false);
        setAddForm(emptyForm(category));
        invalidate();
      },
      onError: () => toast({ title: "Failed to add preset", variant: "destructive" }),
    });
  };

  const handleEdit = (preset: PresetTask) => {
    setEditingId(preset.id);
    setEditForm(presetToForm(preset));
  };

  const handleUpdate = () => {
    if (editingId == null) return;
    const payload = formToPayload(editForm);
    if (!payload.name) return;
    updatePreset.mutate({ presetId: editingId, data: payload }, {
      onSuccess: () => {
        toast({ title: "Preset updated" });
        setEditingId(null);
        invalidate();
      },
      onError: () => toast({ title: "Failed to update preset", variant: "destructive" }),
    });
  };

  const handleDelete = (presetId: number) => {
    deletePreset.mutate({ presetId }, {
      onSuccess: () => {
        toast({ title: "Preset deleted" });
        invalidate();
      },
      onError: () => toast({ title: "Failed to delete preset", variant: "destructive" }),
    });
  };

  const textColorClass =
    getCategoryColor(category).split(" ").find((c) => c.startsWith("text-")) ??
    "text-muted-foreground";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className={`font-semibold uppercase tracking-wider text-sm ${textColorClass}`}>
          {category}
          <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
            ({presets.length})
          </span>
        </h3>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => { setAdding(true); setAddForm(emptyForm(category)); }}
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>

      <div className="space-y-1">
        {presets.map((preset) =>
          editingId === preset.id ? (
            <PresetForm
              key={preset.id}
              form={editForm}
              onChange={setEditForm}
              onSubmit={handleUpdate}
              onCancel={() => setEditingId(null)}
              isPending={updatePreset.isPending}
            />
          ) : (
            <div
              key={preset.id}
              className="group flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-card hover:border-primary/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium inline-flex items-center gap-1">
                  {isKeyTask({ category: preset.category, name: preset.name }) && (
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                  )}
                  {preset.name}
                </span>
                <span className="ml-3 text-xs text-muted-foreground italic">
                  {ruleLabel(preset)}
                </span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleEdit(preset)}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Preset?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Delete "{preset.name}"? This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(preset.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )
        )}

        {presets.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground px-3 py-2">No presets yet.</p>
        )}

        {adding && (
          <PresetForm
            form={addForm}
            onChange={setAddForm}
            onSubmit={handleAdd}
            onCancel={() => setAdding(false)}
            isPending={createPreset.isPending}
          />
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const { data: presets, isLoading } = useListPresetTasks();
  const [presetsOpen, setPresetsOpen] = useState(false);

  const byCategory = (cat: string) =>
    (presets ?? []).filter((p) => p.category === cat);

  return (
    <Layout>
      <div className="container mx-auto p-4 md:p-6 max-w-3xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        </div>

        <GoogleCalendarSettings />

        <div className="rounded-lg border">
          <button
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
            onClick={() => setPresetsOpen((o) => !o)}
          >
            <div>
              <p className="font-semibold">Preset Task Templates</p>
              <p className="text-sm text-muted-foreground">
                Manage templates used when adding tasks to a show.
              </p>
            </div>
            {presetsOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>

          {presetsOpen && (
            <div className="border-t px-4 py-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="space-y-8">
                  {PRESET_CATEGORIES.map((cat) => (
                    <CategorySection key={cat} category={cat} presets={byCategory(cat)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
