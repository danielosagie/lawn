"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

/**
 * shadcn-style Calendar, themed to snip's brutalist palette.
 *
 * Wraps `react-day-picker` v10 so we get keyboard nav, multi-month
 * support, range selection, etc. without rebuilding the calendar
 * logic ourselves. v10 renamed several class keys (caption →
 * month_caption, IconLeft → Chevron, etc.), so the classNames map
 * here uses the new names.
 */
export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-3",
        month_caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-black tracking-tight uppercase",
        nav: "flex items-center gap-1 absolute right-1 top-1",
        button_previous: cn(
          "inline-flex h-6 w-6 items-center justify-center border-2 border-[#1a1a1a] bg-[#f0f0e8] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f0f0e8] transition-colors",
        ),
        button_next: cn(
          "inline-flex h-6 w-6 items-center justify-center border-2 border-[#1a1a1a] bg-[#f0f0e8] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f0f0e8] transition-colors",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-[#888] w-8 font-mono font-bold text-[10px] uppercase tracking-wider",
        week: "flex w-full mt-1",
        day: cn(
          "relative p-0 text-center text-sm h-8 w-8 font-mono font-bold",
        ),
        day_button: cn(
          "h-8 w-8 p-0 inline-flex items-center justify-center hover:bg-[#e8e8e0] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]",
        ),
        selected:
          "[&_button]:bg-[#FF6600] [&_button]:text-[#f0f0e8] [&_button]:hover:bg-[#FF7A1F]",
        today: "[&_button]:underline [&_button]:underline-offset-2",
        outside: "[&_button]:text-[#bbb]",
        disabled: "[&_button]:text-[#bbb] [&_button]:line-through [&_button]:cursor-not-allowed",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
