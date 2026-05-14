"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Chip-style multi-select with a free-form add field.
 *
 * Why this and not a plain `<select multiple>`:
 *   - Lets the user pick from a quick-options list (deliverable
 *     formats, color spaces, anything finite we can pre-enumerate)
 *     AND add custom values not in the list (typing in their own
 *     terms with Enter or the inline add button).
 *   - Values are stored as a single semicolon-separated string so
 *     the existing wizard answers blob doesn't need a schema change.
 *
 * Output shape: a `;`-joined string. Empty string when nothing
 * selected. Mirrors the `WizardAnswers[string]` contract.
 */

const SEPARATOR = "; ";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  options: Option[];
  placeholder?: string;
  /** Help copy for the custom-add field. */
  customHint?: string;
  disabled?: boolean;
}

export function MultiCombobox({
  value,
  onChange,
  options,
  placeholder = "Add custom…",
  customHint = "Type your own and press Enter",
  disabled,
}: Props) {
  const selected = parseValue(value);
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const setSelected = (next: string[]) => {
    onChange(serializeValue(next));
  };

  const toggleOption = (val: string) => {
    if (selectedSet.has(val)) {
      setSelected(selected.filter((s) => s !== val));
    } else {
      setSelected([...selected, val]);
    }
  };

  const addCustom = () => {
    const next = draft.trim();
    if (!next) return;
    if (!selectedSet.has(next)) {
      setSelected([...selected, next]);
    }
    setDraft("");
    inputRef.current?.focus();
  };

  const removeChip = (val: string) => {
    setSelected(selected.filter((s) => s !== val));
  };

  return (
    <div className="space-y-3">
      {/* Quick options grid — click to toggle. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => {
          const isOn = selectedSet.has(opt.value);
          return (
            <button
              type="button"
              key={opt.value}
              onClick={() => toggleOption(opt.value)}
              disabled={disabled}
              className={cn(
                "flex items-center gap-2 px-3 py-2 border-2 text-sm text-left transition-colors",
                isOn
                  ? "border-[#FF6600] bg-[#FF6600] text-[#f0f0e8] font-bold"
                  : "border-[#1a1a1a] bg-[#f0f0e8] text-[#1a1a1a] hover:bg-[#e8e8e0]",
              )}
            >
              <span
                className={cn(
                  "w-4 h-4 flex-shrink-0 flex items-center justify-center border-2",
                  isOn
                    ? "border-[#f0f0e8] bg-[#f0f0e8] text-[#FF6600]"
                    : "border-[#1a1a1a]",
                )}
              >
                {isOn ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <span className="flex-1">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Custom add row. */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder={placeholder}
          className="flex-1 border-2 border-[#1a1a1a] bg-[#f0f0e8] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#1a1a1a] placeholder:text-[#888]"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={disabled || !draft.trim()}
          className="inline-flex items-center gap-1 px-3 py-2 border-2 border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8] text-xs font-bold uppercase tracking-wider hover:bg-[#FF6600] disabled:opacity-40 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
      <p className="text-[11px] font-mono text-[#888]">{customHint}</p>

      {/* Chips of currently-selected values — both quick + custom. */}
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((v) => {
            const label = options.find((o) => o.value === v)?.label ?? v;
            return (
              <span
                key={v}
                className="inline-flex items-center gap-1.5 px-2 py-1 border-2 border-[#1a1a1a] bg-[#f0f0e8] text-xs font-bold"
              >
                {label}
                <button
                  type="button"
                  onClick={() => removeChip(v)}
                  className="text-[#888] hover:text-[#dc2626]"
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function parseValue(value: string): string[] {
  if (!value) return [];
  return value
    .split(/;\s*|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function serializeValue(values: string[]): string {
  return values.join(SEPARATOR);
}
