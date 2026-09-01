import { Loader2 } from "lucide-react";
import { useTodoist } from "@/contexts/todoist-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function ProjectPicker({
  label,
  value,
  onChange,
  projects,
  loading,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  projects: { id: string; name: string }[];
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium shrink-0 w-20">{label}</span>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-sm max-w-xs">
            <SelectValue placeholder="Inbox (default)" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function TodoistSettings() {
  const {
    taskProjectId,
    eblastProjectId,
    projects,
    loadingProjects,
    setTaskProjectId,
    setEblastProjectId,
  } = useTodoist();

  return (
    <div className="rounded-lg border">
      <div className="px-4 py-3">
        <p className="font-semibold">Todoist</p>
        <p className="text-sm text-muted-foreground">
          Choose which projects to push tasks and e-blasts to.
        </p>
      </div>
      <div className="border-t px-4 py-3 space-y-2.5">
        <ProjectPicker
          label="Tasks →"
          value={taskProjectId}
          onChange={setTaskProjectId}
          projects={projects}
          loading={loadingProjects}
        />
        <ProjectPicker
          label="e-Blasts →"
          value={eblastProjectId}
          onChange={setEblastProjectId}
          projects={projects}
          loading={loadingProjects}
        />
      </div>
    </div>
  );
}
