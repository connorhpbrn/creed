"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  key: string;
  value: string;
  label: string;
  description?: string;
  search?: string;
  meta?: ReactNode;
};

export function SearchableSelect({
  value,
  onChange,
  placeholder,
  searchPlaceholder = "Search...",
  options,
  disabled,
  emptyLabel = "No options yet",
  renderOption,
  triggerClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  options: SearchableSelectOption[];
  disabled?: boolean;
  emptyLabel?: string;
  renderOption?: (option: SearchableSelectOption, selected: boolean) => ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options;
    }

    return options.filter((option) =>
      [option.label, option.description, option.value, option.search]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(normalized))
    );
  }, [options, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-11 w-full justify-between rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-left text-[14px] font-normal",
            disabled && "cursor-not-allowed opacity-60",
            triggerClassName
          )}
        >
          <span className={cn("min-w-0 truncate", !selected && "text-[var(--creed-text-secondary)]")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--creed-text-secondary)]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] rounded-2xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-2 shadow-[0_18px_50px_rgba(28,28,26,0.10)]"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--creed-text-tertiary)]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 rounded-xl border-[var(--creed-border)] bg-[var(--creed-background)] pl-9 pr-3 text-[13px]"
          />
        </div>
        <div className="mt-2 max-h-72 overflow-y-auto pr-1 creed-scrollbar">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-[var(--creed-text-secondary)]">
              {emptyLabel}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((option) => {
                const selectedOption = option.value === value;

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[var(--creed-surface-raised)]",
                      selectedOption && "bg-[var(--creed-background)]"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      {renderOption ? (
                        renderOption(option, selectedOption)
                      ) : (
                        <>
                          <div className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                            {option.label}
                          </div>
                          {option.description ? (
                            <div className="mt-1 truncate text-[12px] text-[var(--creed-text-secondary)]">
                              {option.description}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                    {selectedOption ? (
                      <Check className="h-4 w-4 shrink-0 text-[var(--creed-text-primary)]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
