"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  FileSignature,
  Send,
  Save,
  RotateCcw,
  Check,
  Upload,
  Download,
  Cloud,
} from "lucide-react";
import { ContractEditor } from "./ContractEditor";
import { docxFileToHtml, htmlToDocxBlob, triggerBlobDownload } from "@/lib/docx";

interface Props {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_HTML = `<h1>Statement of Work</h1>
<h2>Scope</h2>
<p>Describe what the agency will deliver. Keep it tight — videos to be produced, length, format, platforms.</p>
<h2>Deliverables</h2>
<ul>
  <li>1× hero 60s edit, ProRes 422, 1920×1080</li>
  <li>3× 15s social cutdowns, H.264, 1080×1920</li>
</ul>
<h2>Revisions</h2>
<p>Up to <strong>2 rounds</strong> of revisions per deliverable. Additional revisions billed at $150/hr.</p>
<h2>Timeline</h2>
<p>Final delivery on <em>[date]</em>. Client review turnaround: 48 hours.</p>
<h2>Payment</h2>
<p>50% due on signature, balance due on final delivery.</p>
<h2>License</h2>
<p>Upon full payment, client receives a perpetual, worldwide license to use the deliverables for their stated purpose.</p>`;

export function ContractDialog({ projectId, open, onOpenChange }: Props) {
  const project = useQuery(api.projects.get, { projectId });
  const featureStatus = useQuery(api.featureFlags.getFeatureStatus, {});
  const upsertContract = useMutation(api.projects.upsertContract);
  const sendForSignature = useMutation(api.projects.sendContractForSignature);
  const signContractDemo = useMutation(api.projects.signContractDemo);
  const clearContract = useMutation(api.projects.clearContract);
  const linkDocxFile = useMutation(api.projects.linkContractDocxFile);
  const getUploadUrl = useAction(api.contracts.getContractDocxUploadUrl);
  const getDownloadUrl = useAction(api.contracts.getContractDocxDownloadUrl);

  const existing = project?.contract;
  const isSigned = Boolean(existing?.signedAt);
  const isSent = Boolean(existing?.sentForSignatureAt) && !isSigned;

  const [contentHtml, setContentHtml] = useState<string>(DEFAULT_HTML);
  const [scope, setScope] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [revisions, setRevisions] = useState("");
  const [deadline, setDeadline] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [originalFilename, setOriginalFilename] = useState<string | undefined>();
  const [demoSignName, setDemoSignName] = useState("");
  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setContentHtml(existing?.contentHtml ?? DEFAULT_HTML);
    setScope(existing?.scope ?? "");
    setDeliverables(existing?.deliverablesSummary ?? "");
    setPriceDollars(
      existing?.priceCents != null ? (existing.priceCents / 100).toFixed(2) : "",
    );
    setCurrency(existing?.currency ?? "usd");
    setRevisions(existing?.revisionsAllowed?.toString() ?? "");
    setDeadline(existing?.deadline ?? "");
    setClientName(existing?.clientName ?? "");
    setClientEmail(existing?.clientEmail ?? "");
    setOriginalFilename(existing?.originalFilename ?? undefined);
    setError(null);
    setNotice(null);
  }, [open, existing]);

  if (!project) return null;

  const storageReady = featureStatus?.objectStorage ?? false;

  const buildFilename = (): string => {
    const safe = (project.name ?? "contract")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_");
    return `${safe}-contract.docx`;
  };

  const persistContract = async () => {
    await upsertContract({
      projectId,
      contract: {
        contentHtml,
        scope: scope.trim() || undefined,
        deliverablesSummary: deliverables.trim() || undefined,
        priceCents: priceDollars
          ? Math.round(parseFloat(priceDollars) * 100)
          : undefined,
        currency: currency.toLowerCase() || "usd",
        revisionsAllowed: revisions ? parseInt(revisions, 10) : undefined,
        deadline: deadline.trim() || undefined,
        clientName: clientName.trim() || undefined,
        clientEmail: clientEmail.trim() || undefined,
        originalFilename,
      },
    });
  };

  const handleSave = async () => {
    setError(null);
    setNotice(null);
    setBusy("save");
    try {
      await persistContract();
      setNotice("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async (file: File) => {
    setError(null);
    setNotice(null);
    setBusy("import");
    try {
      const result = await docxFileToHtml(file);
      setContentHtml(result.html);
      setOriginalFilename(file.name);
      if (result.warnings.length > 0) {
        setNotice(
          `Imported with ${result.warnings.length} compatibility warning${result.warnings.length === 1 ? "" : "s"}.`,
        );
      } else {
        setNotice(`Imported ${file.name}.`);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not parse .docx: ${e.message}`
          : "Could not parse .docx",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    setError(null);
    setNotice(null);
    setBusy("export");
    try {
      const blob = await htmlToDocxBlob(contentHtml, {
        filename: buildFilename(),
      });
      triggerBlobDownload(blob, buildFilename());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveToCloud = async () => {
    if (!storageReady) {
      setError(
        "Object storage not configured. Set R2_* or RAILWAY_* env vars to persist .docx files.",
      );
      return;
    }
    setError(null);
    setNotice(null);
    setBusy("cloud");
    try {
      // Step 1: save current draft (so the HTML in DB matches what we upload).
      await persistContract();

      // Step 2: convert to docx in browser.
      const blob = await htmlToDocxBlob(contentHtml, {
        filename: buildFilename(),
      });

      // Step 3: presign + upload.
      const presign = await getUploadUrl({
        projectId,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      if (presign.status === "disabled" || !presign.url || !presign.s3Key) {
        setError(presign.reason ?? "Cloud storage is unavailable.");
        return;
      }
      const res = await fetch(presign.url, {
        method: "PUT",
        body: blob,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      });
      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
      }

      // Step 4: link to project.
      await linkDocxFile({ projectId, docxS3Key: presign.s3Key });
      setNotice("Saved a .docx copy to cloud storage.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cloud save failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadStored = async () => {
    setError(null);
    setBusy("download-stored");
    try {
      const result = await getDownloadUrl({ projectId });
      if (result.status !== "ok" || !result.url) {
        setError("No stored .docx yet — use 'Download .docx' to export the current draft.");
        return;
      }
      window.open(result.url, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleSend = async () => {
    setError(null);
    setBusy("send");
    try {
      await sendForSignature({ projectId });
      setNotice("Marked as sent for signature.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleSign = async () => {
    if (!demoSignName.trim()) {
      setError("Type a name to sign.");
      return;
    }
    setError(null);
    setBusy("sign");
    try {
      await signContractDemo({ projectId, signedByName: demoSignName.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signature failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleClear = async () => {
    if (!confirm("Clear the contract? You'll be able to re-draft it.")) return;
    setError(null);
    setBusy("clear");
    try {
      await clearContract({ projectId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" /> Project contract
            {isSigned ? (
              <Badge variant="success">
                <Check className="h-3 w-3 mr-1" /> Signed
              </Badge>
            ) : isSent ? (
              <Badge variant="secondary">Awaiting signature</Badge>
            ) : existing ? (
              <Badge variant="secondary">Draft</Badge>
            ) : null}
            {originalFilename ? (
              <span className="text-xs font-mono text-[#888] ml-2">
                {originalFilename}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            WYSIWYG editor backed by .docx. Upload an existing .docx (mammoth
            parses formatting + tables), or export the current draft as a
            .docx that opens cleanly in Word / Google Docs.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImport(file);
            // Reset so the same file can be re-imported.
            e.target.value = "";
          }}
        />

        {isSigned ? (
          <div className="space-y-3">
            <div className="border-2 border-[#FF6600] bg-[#FFE7D6] p-4">
              <div className="font-bold text-[#FF6600]">
                Signed by {existing?.signedByName}
              </div>
              <div className="text-xs text-[#666] mt-0.5">
                {existing?.signedAt
                  ? new Date(existing.signedAt).toLocaleString()
                  : ""}
              </div>
            </div>
            <ContractEditor
              contentHtml={existing?.contentHtml ?? ""}
              onChange={() => {
                /* read-only when signed */
              }}
              editable={false}
            />
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                onClick={() => void handleExport()}
                disabled={busy !== null}
              >
                <Download className="h-4 w-4 mr-1" /> Download .docx
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleClear()}
                disabled={busy !== null}
              >
                <RotateCcw className="h-4 w-4 mr-1" /> Clear contract
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {isSent ? (
              <div className="border-2 border-[#1a1a1a] bg-[#e8e8e0] p-3 text-sm">
                <div className="font-bold">Sent for signature</div>
                <div className="text-xs text-[#666] mt-0.5">
                  In production this emails the client a Dropbox Sign link.
                  For the demo, click "Sign as client" below to simulate the
                  client signing.
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Client name">
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Acme Co."
                />
              </Field>
              <Field label="Client email">
                <Input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="contact@acme.com"
                />
              </Field>
              <Field label="Price">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step={1}
                    value={priceDollars}
                    onChange={(e) => setPriceDollars(e.target.value)}
                    placeholder="5000"
                  />
                  <Input
                    value={currency.toUpperCase()}
                    onChange={(e) =>
                      setCurrency(e.target.value.toLowerCase().slice(0, 4))
                    }
                    className="w-20 uppercase"
                  />
                </div>
              </Field>
              <Field label="Revisions allowed">
                <Input
                  type="number"
                  value={revisions}
                  onChange={(e) => setRevisions(e.target.value)}
                  placeholder="2"
                />
              </Field>
              <Field label="Deadline">
                <Input
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  placeholder="2026-06-30"
                />
              </Field>
              <Field label="Scope (short)">
                <Input
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="Brand launch video"
                />
              </Field>
            </div>

            <Field label="Deliverables summary">
              <Input
                value={deliverables}
                onChange={(e) => setDeliverables(e.target.value)}
                placeholder="1× 60s hero, 3× 15s cutdowns"
              />
            </Field>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase tracking-[0.15em] text-[#888] font-bold">
                  Contract document
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#1a1a1a] hover:text-[#FF6600] underline underline-offset-2"
                  >
                    <Upload className="h-3 w-3" />
                    {busy === "import" ? "Importing…" : "Upload .docx"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport()}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#1a1a1a] hover:text-[#FF6600] underline underline-offset-2"
                  >
                    <Download className="h-3 w-3" />
                    {busy === "export" ? "Generating…" : "Download .docx"}
                  </button>
                </div>
              </div>
              <ContractEditor
                contentHtml={contentHtml}
                onChange={setContentHtml}
              />
            </div>

            {notice ? (
              <div className="text-sm text-[#FF6600] border-l-2 border-[#FF6600] pl-2">
                {notice}
              </div>
            ) : null}
            {error ? (
              <div className="text-sm text-[#dc2626] border-l-2 border-[#dc2626] pl-2">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t-2 border-[#1a1a1a]">
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => void handleSave()} disabled={busy !== null}>
                  <Save className="h-4 w-4 mr-1" />
                  {busy === "save"
                    ? "Saving…"
                    : existing
                      ? "Save draft"
                      : "Create contract"}
                </Button>
                {existing ? (
                  <Button
                    variant="outline"
                    onClick={() => void handleSaveToCloud()}
                    disabled={busy !== null}
                    title={
                      storageReady
                        ? "Store the .docx in your S3/R2 bucket"
                        : "Configure object storage to enable"
                    }
                  >
                    <Cloud className="h-4 w-4 mr-1" />
                    {busy === "cloud"
                      ? "Uploading…"
                      : storageReady
                        ? "Save .docx to cloud"
                        : "Cloud save (storage off)"}
                  </Button>
                ) : null}
                {existing?.docxS3Key ? (
                  <Button
                    variant="outline"
                    onClick={() => void handleDownloadStored()}
                    disabled={busy !== null}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    {busy === "download-stored" ? "Opening…" : "Stored .docx"}
                  </Button>
                ) : null}
                {existing && !isSent ? (
                  <Button
                    variant="outline"
                    onClick={() => void handleSend()}
                    disabled={busy !== null}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    {busy === "send" ? "Sending…" : "Send for signature"}
                  </Button>
                ) : null}
              </div>

              {existing ? (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Name to sign as (demo)"
                    value={demoSignName}
                    onChange={(e) => setDemoSignName(e.target.value)}
                    className="w-56"
                  />
                  <Button
                    onClick={() => void handleSign()}
                    disabled={busy !== null || !demoSignName.trim()}
                    className="bg-[#FF6600] hover:bg-[#FF7A1F]"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    {busy === "sign" ? "Signing…" : "Sign as client (demo)"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-[0.15em] text-[#888] font-bold mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
