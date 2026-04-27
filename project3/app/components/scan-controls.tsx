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
    const nextSelectedRepoIds = formData
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
          selectedRepoIds: nextSelectedRepoIds,
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

      for (const repoId of nextSelectedRepoIds) {
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
    <form method="GET" onSubmit={onSubmit} className="slb-form-grid">
      {isSubmitting ? (
        <div className="slb-alert">
          <div className="slb-inline-meta">
            <span className="slb-badge slb-badge--ok">Scan Running</span>
            <span className="slb-note">{elapsedSeconds}s elapsed</span>
          </div>
          <p className="slb-body-copy" style={{ marginTop: "8px" }}>
            Analyzing forks, lag status, framework adoption, and file comparison.
          </p>
        </div>
      ) : null}

      <div className="slb-field">
        <span>Repository Scope</span>
        <select
          name="selectedRepoIds"
          multiple
          defaultValue={selectedRepoIds.map(String)}
          className="slb-multi-select"
          disabled={isSubmitting}
        >
          {repoOptions.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.fullName} ({repo.forksCount} forks)
            </option>
          ))}
        </select>
      </div>

      <div className="slb-form-grid slb-form-grid--2">
        <label className="slb-field">
          <span>Scan Profile</span>
          <select
            name="scanMode"
            defaultValue={selectedScanMode && selectedScanMode !== "custom" ? selectedScanMode : "standard"}
            className="slb-select"
            disabled={isSubmitting}
          >
            {SCAN_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({SCAN_PRESET_DEPTHS[option.value]} commits)
              </option>
            ))}
          </select>
        </label>

        <div className="slb-field" style={{ justifyContent: "flex-end" }}>
          <span>Run Analysis</span>
          <button type="submit" className="slb-button" disabled={isSubmitting}>
            {isSubmitting ? "Running Scan..." : "Run Scan ->"}
          </button>
        </div>
      </div>

      <details className="slb-advanced">
        <summary>Advanced Settings</summary>
        <div className="slb-form-grid" style={{ marginTop: "14px" }}>
          <label className="slb-inline-meta">
            <input type="checkbox" name="useCustomDepth" defaultChecked={typeof selectedCustomCommitDepth === "number"} disabled={isSubmitting} />
            <span className="slb-note">Use custom scan depth</span>
          </label>

          <div className="slb-form-grid slb-form-grid--2">
            <label className="slb-field">
              <span>Custom Depth</span>
              <input
                type="number"
                name="customCommitDepth"
                min={20}
                max={1000}
                defaultValue={selectedCustomCommitDepth ?? ""}
                className="slb-input"
                placeholder="20-1000"
                disabled={isSubmitting}
              />
            </label>

            <div />
          </div>

          <label className="slb-inline-meta">
            <input
              type="checkbox"
              name="useCustomLagThresholds"
              defaultChecked={
                typeof selectedCustomLagCommitThreshold === "number" || typeof selectedCustomLagNoSyncDaysThreshold === "number"
              }
              disabled={isSubmitting}
            />
            <span className="slb-note">Use custom lag thresholds</span>
          </label>

          <div className="slb-form-grid slb-form-grid--2">
            <label className="slb-field">
              <span>Custom Lag Commits</span>
              <input
                type="number"
                name="customLagCommitThreshold"
                min={1}
                max={5000}
                defaultValue={selectedCustomLagCommitThreshold ?? ""}
                className="slb-input"
                placeholder="1-5000"
                disabled={isSubmitting}
              />
            </label>

            <label className="slb-field">
              <span>Custom Lag No-Sync Days</span>
              <input
                type="number"
                name="customLagNoSyncDaysThreshold"
                min={1}
                max={3650}
                defaultValue={selectedCustomLagNoSyncDaysThreshold ?? ""}
                className="slb-input"
                placeholder="1-3650"
                disabled={isSubmitting}
              />
            </label>
          </div>
        </div>
      </details>

      {errorMessage ? <p className="slb-note" style={{ color: "#b42318" }}>{errorMessage}</p> : null}
    </form>
  );
}
