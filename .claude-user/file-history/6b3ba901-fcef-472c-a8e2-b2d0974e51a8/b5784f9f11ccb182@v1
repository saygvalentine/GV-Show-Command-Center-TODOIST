import { Link, useLocation } from "wouter";
import { Moon, Sun, LayoutDashboard, Search, CheckSquare } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b bg-background">
        <div className="container flex h-14 items-center gap-4 mx-auto px-4 md:px-6">
          <div className="flex items-center gap-2 font-bold font-mono tracking-tight text-primary">
            <LayoutDashboard className="h-5 w-5" />
            <span>CMD CENTER</span>
          </div>
          
          <nav className="flex items-center gap-6 ml-6 text-sm font-medium">
            <Link href="/" className={`transition-colors hover:text-foreground/80 ${location === "/" ? "text-foreground" : "text-foreground/60"}`}>
              Dashboard
            </Link>
            <Link href="/calendar" className={`transition-colors hover:text-foreground/80 ${location === "/calendar" ? "text-foreground" : "text-foreground/60"}`}>
              Calendar
            </Link>
            <Link href="/office-tasks" className={`flex items-center gap-1.5 transition-colors hover:text-foreground/80 ${location === "/office-tasks" ? "text-foreground" : "text-foreground/60"}`}>
              <CheckSquare className="h-3.5 w-3.5" />
              Office Tasks
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <div className="relative hidden md:flex">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search shows..."
                className="w-64 pl-8 h-9 bg-muted/50 border-none focus-visible:ring-1"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </div>
        </div>
      </header>
      
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
