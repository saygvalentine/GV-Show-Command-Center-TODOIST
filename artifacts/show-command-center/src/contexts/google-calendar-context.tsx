// @refresh reset
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "gcal_prefs";

interface StoredPrefs {
  taskCalendarId: string;
  eblastCalendarId: string;
}

export interface GcalCalendar {
  id: string;
  summary: string;
  primary?: boolean;
}

interface GcalContextValue {
  taskCalendarId: string;
  eblastCalendarId: string;
  calendars: GcalCalendar[];
  loadingCalendars: boolean;
  setTaskCalendarId: (id: string) => void;
  setEblastCalendarId: (id: string) => void;
}

const GcalContext = createContext<GcalContextValue | null>(null);

function loadPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Migrate from old gcal_auth key
      const old = localStorage.getItem("gcal_auth");
      if (old) {
        const parsed = JSON.parse(old) as { taskCalendarId?: string; eblastCalendarId?: string; calendarId?: string };
        return {
          taskCalendarId: parsed.taskCalendarId ?? parsed.calendarId ?? "primary",
          eblastCalendarId: parsed.eblastCalendarId ?? parsed.calendarId ?? "primary",
        };
      }
      return { taskCalendarId: "primary", eblastCalendarId: "primary" };
    }
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      taskCalendarId: parsed.taskCalendarId ?? "primary",
      eblastCalendarId: parsed.eblastCalendarId ?? "primary",
    };
  } catch {
    return { taskCalendarId: "primary", eblastCalendarId: "primary" };
  }
}

function savePrefs(prefs: StoredPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function GcalProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<StoredPrefs>(loadPrefs);
  const [calendars, setCalendars] = useState<GcalCalendar[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  useEffect(() => {
    setLoadingCalendars(true);
    fetch("/api/export/google-calendar/calendars")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { calendars?: GcalCalendar[] }) => {
        const list = data.calendars ?? [];
        setCalendars(list);
        // Resolve "primary" to the actual primary calendar ID so the picker shows a selection
        const primaryCal = list.find((c) => c.primary);
        if (primaryCal) {
          setPrefs((prev) => {
            const updated = {
              taskCalendarId: prev.taskCalendarId === "primary" ? primaryCal.id : prev.taskCalendarId,
              eblastCalendarId: prev.eblastCalendarId === "primary" ? primaryCal.id : prev.eblastCalendarId,
            };
            savePrefs(updated);
            return updated;
          });
        }
      })
      .catch(() => {/* silently fail — pickers will just be empty */})
      .finally(() => setLoadingCalendars(false));
  }, []);

  const setTaskCalendarId = useCallback((taskCalendarId: string) => {
    setPrefs((prev) => {
      const updated = { ...prev, taskCalendarId };
      savePrefs(updated);
      return updated;
    });
  }, []);

  const setEblastCalendarId = useCallback((eblastCalendarId: string) => {
    setPrefs((prev) => {
      const updated = { ...prev, eblastCalendarId };
      savePrefs(updated);
      return updated;
    });
  }, []);

  return (
    <GcalContext.Provider
      value={{
        taskCalendarId: prefs.taskCalendarId,
        eblastCalendarId: prefs.eblastCalendarId,
        calendars,
        loadingCalendars,
        setTaskCalendarId,
        setEblastCalendarId,
      }}
    >
      {children}
    </GcalContext.Provider>
  );
}

export function useGcal(): GcalContextValue {
  const ctx = useContext(GcalContext);
  if (!ctx) throw new Error("useGcal must be used inside GcalProvider");
  return ctx;
}
