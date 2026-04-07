"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { SCAN_PRESET_DEPTHS } from "@/lib/github";
import type { ScanMode } from "@/lib/github";

type ScanControlsProps = {
  selectedScanMode?: ScanMode;
  selectedCustomCommitDepth?: number;
  selectedCustomLagCommitThreshold?: number;
  selectedCustomLagNoSyncDaysThreshold?: number;
  selectedRepoIds?: number[];
  repoOptions: Array<{
    id: number;
    fullName: string;
    forksCount: number;
  }>;
  targetPath?: string;
};

const SCAN_MODE_OPTIONS: Array<{ value: ScanMode; label: string }> = [
  { value: "quick", label: "Quick" },
  { value: "standard", label: "Standard" },
  { value: "deep", label: "Deep" },
];

function parseOptionalInt(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return undefined;
  }
  return parsed;
}

export default function ScanControls({
  selectedScanMode,
  selectedCustomCommitDepth,
  selectedCustomLagCommitThreshold,
  selectedCustomLagNoSyncDaysThreshold,
  selectedRepoIds = [],
  repoOptions,
  targetPath = "/",
}: ScanControlsProps) {
  const router = useRouter();
  const { update } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isSubmitting) {
      setElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, [isSubmitting]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const scanModeRaw = formData.get("scanMode");
    const scanMode = typeof scanModeRaw === "string" && scanModeRaw.length > 0 ? (scanModeRaw as ScanMode) : undefined;

    const useCustomDepth = formData.get("useCustomDepth") === "on";
    const useCustomLagThresholds = formData.get("useCustomLagThresholds") === "on";
    const customCommitDepth = parseOptionalInt(formData.get("customCommitDepth"));
    const customLagCommitThreshold = parseOptionalInt(formData.get("customLagCommitThreshold"));
    const customLagNoSyncDaysThreshold = parseOptionalInt(formData.get("customLagNoSyncDaysThreshold"));
    const selectedRepoIds = formData
      .getAll("selectedRepoIds")
      .map((value) => (typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (!scanMode) {
      setErrorMessage("Select a scan profile before running analysis.");
      return;
    }

    if (useCustomDepth && customCommitDepth === undefined) {
      setErrorMessage("Advanced custom depth requires a commit depth.");
      return;
    }

    if (useCustomLagThresholds && (customLagCommitThreshold === undefined || customLagNoSyncDaysThreshold === undefined)) {
      setErrorMessage("Advanced custom lag thresholds require both fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      await update({
        scanPreferences: {
          scanMode,
          customCommitDepth: useCustomDepth ? customCommitDepth : undefined,
          lagThresholdMode: useCustomLagThresholds ? "custom" : "balanced",
          customLagCommitThreshold: useCustomLagThresholds ? customLagCommitThreshold : undefined,
          customLagNoSyncDaysThreshold: useCustomLagThresholds ? customLagNoSyncDaysThreshold : undefined,
          selectedRepoIds,
        },
      });

      const params = new URLSearchParams();
      params.set("scanMode", scanMode);

      if (useCustomDepth && customCommitDepth !== undefined) {
        params.set("customCommitDepth", String(customCommitDepth));
      }

      if (useCustomLagThresholds) {
        params.set("lagThresholdMode", "custom");
        params.set("customLagCommitThreshold", String(customLagCommitThreshold));
        params.set("customLagNoSyncDaysThreshold", String(customLagNoSyncDaysThreshold));
      }

      for (const repoId of selectedRepoIds) {
        params.append("selectedRepoIds", String(repoId));
      }

      router.push(`${targetPath}?${params.toString()}`);
      router.refresh();
    } catch {
      setErrorMessage("Failed to persist scan preferences in your session.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form method="GET" onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-4">
      {isSubmitting ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-900 md:col-span-4">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" className="stroke-blue-200" strokeWidth="4" />
              <path d="M22 12a10 10 0 0 0-10-10" className="stroke-blue-700" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <p className="text-sm font-medium">Scan running...</p>
            <p className="text-xs text-blue-800">{elapsedSeconds}s elapsed</p>
          </div>
          <p className="mt-1 text-xs text-blue-800">Analyzing forks, lag status, framework adoption, and file comparison.</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-blue-100">
            <div className="h-full w-2/5 animate-pulse rounded bg-blue-600" />
          </div>
        </div>
      ) : null}

      <label className="text-sm text-zinc-700 md:col-span-4">
        <span className="mb-1 block">Repository scope (only repos with at least one fork)</span>
        <select
          name="selectedRepoIds"
          multiple
          defaultValue={selectedRepoIds.map(String)}
          className="min-h-36 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          disabled={isSubmitting}
        >
          {repoOptions.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.fullName} ({repo.forksCount} forks)
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-zinc-700 md:col-span-2">
        <span className="mb-1 block">Scan profile</span>
        <select
          name="scanMode"
          defaultValue={selectedScanMode && selectedScanMode !== "custom" ? selectedScanMode : "standard"}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          disabled={isSubmitting}
        >
          {SCAN_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({SCAN_PRESET_DEPTHS[option.value]} commits)
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="self-end rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Running scan..." : "Run scan"}
      </button>

      <details className="rounded-md border border-zinc-200 bg-white p-3 md:col-span-4">
        <summary className="cursor-pointer text-sm font-medium text-zinc-800">Advanced Settings</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700 md:col-span-2">
            <input
              type="checkbox"
              name="useCustomDepth"
              defaultChecked={typeof selectedCustomCommitDepth === "number"}
              disabled={isSubmitting}
            />
            Use custom scan depth
          </label>
          <label className="text-sm text-zinc-700">
            <span className="mb-1 block">Custom depth</span>
            <input
              type="number"
              name="customCommitDepth"
              min={20}
              max={1000}
              defaultValue={selectedCustomCommitDepth ?? ""}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
              placeholder="20-1000"
              disabled={isSubmitting}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-700 md:col-span-2">
            <input
              type="checkbox"
              name="useCustomLagThresholds"
              defaultChecked={
                typeof selectedCustomLagCommitThreshold === "number" || typeof selectedCustomLagNoSyncDaysThreshold === "number"
              }
              disabled={isSubmitting}
            />
            Use custom lag thresholds
          </label>
          <label className="text-sm text-zinc-700">
            <span className="mb-1 block">Custom lag commits</span>
            <input
              type="number"
              name="customLagCommitThreshold"
              min={1}
              max={5000}
              defaultValue={selectedCustomLagCommitThreshold ?? ""}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
              placeholder="1-5000"
              disabled={isSubmitting}
            />
          </label>

          <label className="text-sm text-zinc-700">
            <span className="mb-1 block">Custom lag no-sync days</span>
            <input
              type="number"
              name="customLagNoSyncDaysThreshold"
              min={1}
              max={3650}
              defaultValue={selectedCustomLagNoSyncDaysThreshold ?? ""}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
              placeholder="1-3650"
              disabled={isSubmitting}
            />
          </label>
        </div>
      </details>

      {errorMessage ? <p className="text-xs text-red-700 md:col-span-4">{errorMessage}</p> : null}
    </form>
  );
}
