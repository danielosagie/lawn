"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  SECTION_TO_ANSWER_KEYS,
  findQuestionByKey,
  type ProjectType,
  type WizardAnswers,
  type WizardQuestion,
  type AnswerValue,
} from "@convex/contractTemplates";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiCombobox } from "@/components/ui/multi-combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

/**
 * Per-section answer editor. Surfaces the wizard answers that fed a
 * specific clause and lets the user change them without re-running
 * the wizard. Each edit hits `updateWizardAnswer` which re-derives
 * the entire contract body from the new answer set.
 *
 * Skipped if the section is pure boilerplate (no entries in
 * SECTION_TO_ANSWER_KEYS) — those clauses have nothing user-tunable.
 */

interface Props {
  projectId: Id<"projects">;
  sectionKey: string;
  projectType: ProjectType | null;
  /** Parsed `wizardAnswers` blob from the contract. */
  answers: WizardAnswers;
  /** When true, controls are disabled (signed / sent). */
  readOnly: boolean;
}

export function SectionAnswerFields({
  projectId,
  sectionKey,
  projectType,
  answers,
  readOnly,
}: Props) {
  const keys = SECTION_TO_ANSWER_KEYS[sectionKey];
  if (!keys || keys.length === 0) {
    return (
      <div className="text-[11px] font-mono text-[#888] italic">
        Standard boilerplate — nothing to tune here.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {keys.map((key) => {
        const question = findQuestionByKey(
          key,
          projectType ?? undefined,
        );
        if (!question) {
          // Defensive: a stored answer key without a matching question
          // shouldn't normally happen, but if it does we render a
          // read-only chip so the user at least sees what's in there.
          return (
            <div
              key={key}
              className="text-[10px] font-mono text-[#888]"
            >
              {key} = <code>{String(answers[key] ?? "—")}</code>
            </div>
          );
        }
        return (
          <AnswerField
            key={key}
            projectId={projectId}
            question={question}
            value={answers[key]}
            disabled={readOnly}
          />
        );
      })}
    </div>
  );
}

/**
 * Renders the right editor for a single wizard answer based on the
 * question's kind, and pushes changes through the
 * `updateWizardAnswer` mutation on blur / submit.
 *
 * Local state mirrors the input value so typing feels instant; the
 * mutation only fires when the input is blurred or its `onValueChange`
 * pattern signals a discrete commit (selects, dates, multi-combobox).
 */
function AnswerField({
  projectId,
  question,
  value,
  disabled,
}: {
  projectId: Id<"projects">;
  question: WizardQuestion;
  value: AnswerValue | undefined;
  disabled: boolean;
}) {
  const updateAnswer = useMutation(api.contractClauses.updateWizardAnswer);
  const [local, setLocal] = useState<AnswerValue>(value ?? null);
  const [saving, setSaving] = useState(false);

  // Sync server-side changes (e.g. another co-editor) back into the
  // local input without trampling an in-flight edit.
  useEffect(() => {
    if (saving) return;
    setLocal(value ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = async (next: AnswerValue) => {
    if (next === local && next === (value ?? null)) return;
    setSaving(true);
    try {
      await updateAnswer({ projectId, key: question.id, value: next });
      setLocal(next);
    } catch (e) {
      // Roll back the local optimism so the UI matches what's
      // actually persisted on the server.
      setLocal(value ?? null);
      alert(e instanceof Error ? e.message : "Couldn't save change.");
    } finally {
      setSaving(false);
    }
  };

  const label = (
    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#888] mb-1 flex items-center gap-1.5">
      <span className="truncate">{question.prompt}</span>
      {saving ? (
        <span className="text-[#FF6600] normal-case font-normal">
          saving…
        </span>
      ) : null}
    </div>
  );

  if (question.kind === "select") {
    return (
      <label className="block">
        {label}
        <Select
          value={(local as string) ?? ""}
          onValueChange={(v) => void commit(v)}
          disabled={disabled}
        >
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {question.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    );
  }
  if (question.kind === "multiselect") {
    return (
      <div>
        {label}
        <MultiCombobox
          value={(local as string) ?? ""}
          onChange={(next) => void commit(next)}
          options={question.options}
          placeholder={question.placeholder}
          disabled={disabled}
        />
      </div>
    );
  }
  if (question.kind === "date") {
    return (
      <div>
        {label}
        <DatePicker
          value={(local as string) ?? ""}
          onChange={(next) => void commit(next)}
          disabled={disabled}
        />
      </div>
    );
  }
  if (question.kind === "boolean") {
    return (
      <div>
        {label}
        <div className="flex gap-2">
          {([true, false] as const).map((bv) => (
            <button
              type="button"
              key={String(bv)}
              onClick={() => void commit(bv)}
              disabled={disabled}
              className={cn(
                "px-3 py-1 border-2 border-[#1a1a1a] text-sm font-bold",
                local === bv
                  ? "bg-[#FF6600] text-[#f0f0e8]"
                  : "bg-[#f0f0e8] hover:bg-[#e8e8e0]",
              )}
            >
              {bv ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (question.kind === "textarea") {
    return (
      <label className="block">
        {label}
        <Textarea
          value={(local as string) ?? ""}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => void commit((local as string) ?? "")}
          disabled={disabled}
          rows={3}
        />
      </label>
    );
  }
  // text / email / number — same input shape.
  const isNumber = question.kind === "number";
  return (
    <label className="block">
      {label}
      <Input
        type={isNumber ? "number" : question.kind === "email" ? "email" : "text"}
        value={(local as string | number) ?? ""}
        onChange={(e) =>
          setLocal(
            isNumber
              ? e.target.value === ""
                ? null
                : Number.isFinite(parseFloat(e.target.value))
                  ? parseFloat(e.target.value)
                  : e.target.value
              : e.target.value,
          )
        }
        onBlur={() => void commit(local as AnswerValue)}
        placeholder={question.placeholder}
        disabled={disabled}
      />
    </label>
  );
}
