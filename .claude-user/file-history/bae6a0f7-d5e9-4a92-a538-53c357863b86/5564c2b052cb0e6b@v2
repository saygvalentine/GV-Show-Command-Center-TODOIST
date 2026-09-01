// @refresh reset
import { createContext, useCallback, useContext, useState } from "react";
import { useListTodoistProjects } from "@workspace/api-client-react";

const STORAGE_KEY = "todoist_prefs";

interface StoredPrefs {
  taskProjectId: string;
  eblastProjectId: string;
}

export interface TodoistProject {
  id: string;
  name: string;
}

interface TodoistContextValue {
  taskProjectId: string;
  eblastProjectId: string;
  projects: TodoistProject[];
  loadingProjects: boolean;
  setTaskProjectId: (id: string) => void;
  setEblastProjectId: (id: string) => void;
}

const TodoistContext = createContext<TodoistContextValue | null>(null);

function loadPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { taskProjectId: "", eblastProjectId: "" };
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      taskProjectId: parsed.taskProjectId ?? "",
      eblastProjectId: parsed.eblastProjectId ?? "",
    };
  } catch {
    return { taskProjectId: "", eblastProjectId: "" };
  }
}

function savePrefs(prefs: StoredPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function TodoistProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<StoredPrefs>(loadPrefs);
  const { data, isLoading: loadingProjects } = useListTodoistProjects();
  const projects = data?.projects ?? [];

  const setTaskProjectId = useCallback((taskProjectId: string) => {
    setPrefs((prev) => {
      const updated = { ...prev, taskProjectId };
      savePrefs(updated);
      return updated;
    });
  }, []);

  const setEblastProjectId = useCallback((eblastProjectId: string) => {
    setPrefs((prev) => {
      const updated = { ...prev, eblastProjectId };
      savePrefs(updated);
      return updated;
    });
  }, []);

  return (
    <TodoistContext.Provider
      value={{
        taskProjectId: prefs.taskProjectId,
        eblastProjectId: prefs.eblastProjectId,
        projects,
        loadingProjects,
        setTaskProjectId,
        setEblastProjectId,
      }}
    >
      {children}
    </TodoistContext.Provider>
  );
}

export function useTodoist(): TodoistContextValue {
  const ctx = useContext(TodoistContext);
  if (!ctx) throw new Error("useTodoist must be used inside TodoistProvider");
  return ctx;
}
