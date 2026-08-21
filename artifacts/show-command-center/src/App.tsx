import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GcalProvider } from "@/contexts/google-calendar-context";
import { TodoistProvider } from "@/contexts/todoist-context";

import Dashboard from "@/pages/dashboard";
import Calendar from "@/pages/calendar";
import ShowDetail from "@/pages/show-detail";
import OfficeTasks from "@/pages/office-tasks";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/office-tasks" component={OfficeTasks} />
      <Route path="/settings" component={Settings} />
      <Route path="/shows/:id" component={ShowDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <GcalProvider>
          <TodoistProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </TodoistProvider>
        </GcalProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
