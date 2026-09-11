// @refresh reset
import { createContext, useCallback, useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTodoistProjects,
  useGetTodoistSettings,
  useUpdateTodoistSettings,
  getGetTodoistSettingsQueryKey,
  type UpdateTodoistSettingsBody,
} from "@workspace/api-client-react";

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

export function TodoistProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: projectData, isLoading: loadingProjects } = useListTodoistProjects();
  const { data: settings, isLoading: loadingSettings } = useGetTodoistSettings();
  const updateSettings = useUpdateTodoistSettings();

  const projects = projectData?.projects ?? [];

  // Project preferences live in the database rather than this browser's localStorage, so
  // the server can read them without a browser session — a prerequisite for automatic sync.
  const saveSettings = useCallback(
    (patch: UpdateTodoistSettingsBody) => {
      updateSettings.mutate(
        { data: patch },
        {
          onSuccess: (updated) => {
            queryClient.setQueryData(getGetTodoistSettingsQueryKey(), updated);
          },
        },
      );
    },
    [updateSettings, queryClient],
  );

  const setTaskProjectId = useCallback(
    (taskProjectId: string) => saveSettings({ taskProjectId }),
    [saveSettings],
  );

  const setEblastProjectId = useCallback(
    (eblastProjectId: string) => saveSettings({ eblastProjectId }),
    [saveSettings],
  );

  return (
    <TodoistContext.Provider
      value={{
        taskProjectId: settings?.taskProjectId ?? "",
        eblastProjectId: settings?.eblastProjectId ?? "",
        projects,
        loadingProjects: loadingProjects || loadingSettings,
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
