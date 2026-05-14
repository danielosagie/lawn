"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  PROJECT_TYPE_TEMPLATES,
  UNIVERSAL_QUESTIONS,
  getTemplate,
  type ProjectType,
  type WizardAnswers,
  type WizardQuestion,
} from "@convex/contractTemplates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, Check, FileSignature } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";

interface Props {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

type Step = "type" | "universal" | "specific" | "review";

export function ContractWizard({ projectId, open, onOpenChange, onComplete }: Props) {
  const startFromWizard = useMutation(api.contractClauses.startFromWizard);
  const [step, setStep] = useState<Step>("type");
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [answers, setAnswers] = useState<WizardAnswers>({
    depositPercent: "50",
    revisionsAllowed: 2,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = projectType ? getTemplate(projectType) : null;
  const specificQuestions = template?.typeSpecificQuestions ?? [];

  const universalProgress = useMemo(
    () =>
      UNIVERSAL_QUESTIONS.filter((q) => q.required).every((q) => {
        const v = answers[q.id];
        return v !== undefined && v !== null && String(v).trim() !== "";
      }),
    [answers],
  );
  const specificProgress = useMemo(
    () =>
      specificQuestions
        .filter((q) => q.required)
        .every((q) => {
          const v = answers[q.id];
          return v !== undefined && v !== null && String(v).trim() !== "";
        }),
    [answers, specificQuestions],
  );

  const reset = () => {
    setStep("type");
    setProjectType(null);
    setAnswers({ depositPercent: "50", revisionsAllowed: 2 });
    setError(null);
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!projectType) return;
    setSubmitting(true);
    setError(null);
    try {
      const entries = Object.entries(answers).map(([key, value]) => ({
        key,
        value: value ?? null,
      }));
      await startFromWizard({
        projectId,
        projectType,
        answers: { entries },
      });
      onComplete();
      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate contract.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Draft a contract
          </DialogTitle>
          <DialogDescription>
            Answer a few questions and we'll generate a structured contract
            with the right clauses for this kind of work. You can edit any
            section after.
          </DialogDescription>
        </DialogHeader>

        <Stepper step={step} hasType={Boolean(projectType)} />

        {step === "type" ? (
          <TypePicker
            selected={projectType}
            onSelect={(t) => setProjectType(t)}
          />
        ) : step === "universal" ? (
          <QuestionList
            questions={UNIVERSAL_QUESTIONS}
            answers={answers}
            onChange={setAnswers}
          />
        ) : step === "specific" ? (
          specificQuestions.length === 0 ? (
            <div className="text-sm text-[#888] py-4">
              This project type doesn't have any extra questions. Click Next to
              review your contract.
            </div>
          ) : (
            <QuestionList
              questions={specificQuestions}
              answers={answers}
              onChange={setAnswers}
            />
          )
        ) : (
          <ReviewStep
            projectType={projectType!}
            answers={answers}
          />
        )}

        {error ? (
          <div className="text-sm text-[#dc2626] border-l-2 border-[#dc2626] pl-2">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between pt-3 border-t-2 border-[#1a1a1a]">
          <Button
            variant="outline"
            disabled={step === "type" || submitting}
            onClick={() => {
              if (step === "review") setStep("specific");
              else if (step === "specific") setStep("universal");
              else if (step === "universal") setStep("type");
            }}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>

          {step === "review" ? (
            <Button
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="bg-[#FF6600] hover:bg-[#FF7A1F]"
            >
              <Check className="mr-1.5 h-4 w-4" />
              {submitting ? "Generating…" : "Generate contract"}
            </Button>
          ) : (
            <Button
              disabled={
                (step === "type" && !projectType) ||
                (step === "universal" && !universalProgress) ||
                (step === "specific" && !specificProgress)
              }
              onClick={() => {
                if (step === "type") setStep("universal");
                else if (step === "universal") setStep("specific");
                else if (step === "specific") setStep("review");
              }}
            >
              Next
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step, hasType }: { step: Step; hasType: boolean }) {
  const steps: Array<{ id: Step; label: string }> = [
    { id: "type", label: "Project type" },
    { id: "universal", label: "Basics" },
    { id: "specific", label: "Details" },
    { id: "review", label: "Review" },
  ];
  const currentIndex = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-2 mb-4">
      {steps.map((s, i) => {
        const isPast = i < currentIndex;
        const isCurrent = i === currentIndex;
        const reachable = hasType || i === 0;
        return (
          <div key={s.id} className="flex items-center gap-2 flex-1">
            <div
              className={
                "flex items-center justify-center w-6 h-6 text-[10px] font-bold border-2 border-[#1a1a1a] " +
                (isPast
                  ? "bg-[#FF6600] text-[#f0f0e8]"
                  : isCurrent
                    ? "bg-[#1a1a1a] text-[#f0f0e8]"
                    : reachable
                      ? "bg-[#f0f0e8] text-[#1a1a1a]"
                      : "bg-[#e8e8e0] text-[#888]")
              }
            >
              {isPast ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <div
              className={
                "text-[10px] font-bold uppercase tracking-wider truncate " +
                (isCurrent ? "text-[#1a1a1a]" : "text-[#888]")
              }
            >
              {s.label}
            </div>
            {i < steps.length - 1 ? (
              <div className="flex-1 h-[2px] bg-[#1a1a1a]/30" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TypePicker({
  selected,
  onSelect,
}: {
  selected: ProjectType | null;
  onSelect: (t: ProjectType) => void;
}) {
  return (
    <div>
      <p className="text-sm text-[#1a1a1a] mb-3">
        What kind of project is this? Different types ask different questions
        and generate the relevant clauses.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PROJECT_TYPE_TEMPLATES.map((t) => {
          const isSelected = selected === t.type;
          return (
            <button
              type="button"
              key={t.type}
              onClick={() => onSelect(t.type)}
              className={
                "flex items-start gap-3 p-3 border-2 border-[#1a1a1a] text-left transition-colors " +
                (isSelected
                  ? "bg-[#FF6600] text-[#f0f0e8]"
                  : "bg-[#f0f0e8] text-[#1a1a1a] hover:bg-[#e8e8e0]")
              }
            >
              <div className="text-2xl flex-shrink-0">{t.emoji}</div>
              <div className="min-w-0">
                <div className="font-black text-sm">{t.label}</div>
                <div
                  className={
                    "text-xs mt-0.5 " +
                    (isSelected ? "opacity-80" : "text-[#666]")
                  }
                >
                  {t.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuestionList({
  questions,
  answers,
  onChange,
}: {
  questions: WizardQuestion[];
  answers: WizardAnswers;
  onChange: (next: WizardAnswers) => void;
}) {
  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <QuestionField
          key={q.id}
          question={q}
          value={answers[q.id]}
          onChange={(v) => onChange({ ...answers, [q.id]: v })}
        />
      ))}
    </div>
  );
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: WizardQuestion;
  value: WizardAnswers[string];
  onChange: (next: WizardAnswers[string]) => void;
}) {
  const id = `q_${question.id}`;
  return (
    <label htmlFor={id} className="block">
      <div className="text-[11px] uppercase tracking-[0.12em] font-bold text-[#888] mb-1">
        {question.prompt}
        {question.required ? (
          <span className="ml-1 text-[#dc2626]">*</span>
        ) : null}
      </div>
      {question.help ? (
        <div className="text-xs text-[#666] mb-1.5">{question.help}</div>
      ) : null}
      {question.kind === "textarea" ? (
        <Textarea
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          rows={4}
        />
      ) : question.kind === "select" ? (
        <select
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 border-2 border-[#1a1a1a] bg-[#f0f0e8] text-sm"
        >
          <option value="" disabled>
            Select…
          </option>
          {question.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : question.kind === "boolean" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={
              "px-3 py-1 border-2 border-[#1a1a1a] text-sm font-bold " +
              (value === true ? "bg-[#FF6600] text-[#f0f0e8]" : "bg-[#f0f0e8]")
            }
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={
              "px-3 py-1 border-2 border-[#1a1a1a] text-sm font-bold " +
              (value === false ? "bg-[#FF6600] text-[#f0f0e8]" : "bg-[#f0f0e8]")
            }
          >
            No
          </button>
        </div>
      ) : question.kind === "number" ? (
        <Input
          id={id}
          type="number"
          value={(value as number | string) ?? ""}
          onChange={(e) =>
            onChange(
              e.target.value === ""
                ? null
                : Number.isFinite(parseFloat(e.target.value))
                  ? parseFloat(e.target.value)
                  : e.target.value,
            )
          }
          placeholder={question.placeholder}
        />
      ) : question.kind === "date" ? (
        <Input
          id={id}
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : question.kind === "email" ? (
        <Input
          id={id}
          type="email"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
        />
      ) : (
        <Input
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
        />
      )}
    </label>
  );
}

function ReviewStep({
  projectType,
  answers,
}: {
  projectType: ProjectType;
  answers: WizardAnswers;
}) {
  const template = getTemplate(projectType);
  const allQuestions = [
    ...UNIVERSAL_QUESTIONS,
    ...template.typeSpecificQuestions,
  ];
  return (
    <div className="space-y-3">
      <div className="bg-[#e8e8e0] border-2 border-[#1a1a1a] p-3">
        <div className="font-bold text-sm">
          {template.emoji} {template.label}
        </div>
        <div className="text-xs text-[#666] mt-0.5">{template.description}</div>
      </div>
      <div className="text-sm text-[#1a1a1a]">
        Here's what you entered — clicking <strong>Generate contract</strong>{" "}
        will build the full document with all the standard clauses (payment,
        IP transfer, kill fee, dispute resolution, etc.) plus the
        type-specific sections.
      </div>
      <div className="border-2 border-[#1a1a1a] divide-y divide-[#ccc]">
        {allQuestions.map((q) => {
          const v = answers[q.id];
          if (v === undefined || v === null || String(v).trim() === "") return null;
          return (
            <div key={q.id} className="flex gap-3 p-2 text-xs">
              <div className="w-44 flex-shrink-0 font-mono text-[#888] uppercase tracking-wider">
                {q.prompt}
              </div>
              <div className="flex-1 text-[#1a1a1a] break-words">{String(v)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
