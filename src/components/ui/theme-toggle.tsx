"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={cn(
        "relative h-9 w-9 rounded-full flex items-center justify-center",
        "bg-white/[0.04] hover:bg-white/[0.08]",
        "border border-white/[0.06]",
        "backdrop-blur-sm",
        "transition-all duration-300",
        "text-zinc-400 hover:text-zinc-200"
      )}
      aria-label="Toggle theme"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-[#BEFF00]" />
    </button>
  );
}
