import type { UnlistenFn } from "@tauri-apps/api/event";
import type { BackgroundJob, JobStatus } from "@/types/session-types";
import { JOB_STATUSES } from "@/types/session-types";
import { safeListen } from "@/utils/tauri-event-utils";
import { shouldProcessEventBySession } from "../_hooks/session-event-filter";
import { getAllVisibleJobsAction } from "@/actions/background-jobs/jobs.actions";
import { invoke } from "@/utils/tauri-invoke-wrapper";

const EXCLUDED_WORKFLOW_TYPES = ["file_finder_workflow", "web_search_workflow"] as const;

const ACTIVE_INTERVAL_MS = 5000;
const IDLE_INTERVAL_MS = 15000;
const MAX_BACKOFF_MS = 60000;
const RECENT_EVENT_WINDOW_MS = 4000;
const JITTER_PCT = 0.2;
const COALESCE_MIN_MS = 3000;
const COALESCE_MAX_MS = 5000;

interface StoreSnapshot {
  jobs: BackgroundJob[];
  activeJobs: BackgroundJob[];
  isLoading: boolean;
  error: Error | null;
}

type StoreListener = () => void;

interface ConfigureParams {
  projectDirectory?: string;
  sessionId?: string;
  isUserPresent: boolean;
}

class JobsStore {
  private jobsMap = new Map<string, BackgroundJob>();
  private listeners = new Set<StoreListener>();
  private isLoading = false;
  private error: Error | null = null;
  private isFetching = false;
  private lastFetchTs = 0;
  private consecutiveErrors = 0;
  private lastEventTs = 0;
  private viewedImplementationPlanId: string | null = null;
  private notifiedJobsSet = new Set<string>();
  private presence = false;
  private sessionId: string | undefined;
  private projectDirectory: string | undefined;
  private initialized = false;
  private reconcileTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private coalescedTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private notifyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private unlisteners: UnlistenFn[] = [];
  private lastAccumulatedLength = new Map<string, number>();

  private sessionIdRef = { current: undefined as string | undefined };

  private cachedSnapshot: StoreSnapshot | null = null;
  private snapshotVersion = 0;

  constructor() {
    this.setupEventListeners();
  }

  subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): StoreSnapshot => {
    if (this.cachedSnapshot === null) {
      this.cachedSnapshot = this.computeSnapshot();
    }
    return this.cachedSnapshot;
  };

  private computeSnapshot(): StoreSnapshot {
    const jobs = Array.from(this.jobsMap.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    const activeJobs = jobs.filter((job) =>
      JOB_STATUSES.ACTIVE.includes(job.status)
    );
    return {
      jobs,
      activeJobs,
      isLoading: this.isLoading,
      error: this.error,
    };
  }

  private invalidateSnapshot(): void {
    this.cachedSnapshot = null;
    this.snapshotVersion += 1;
  }

  configure = (params: ConfigureParams): void => {
    const needsReconcile =
      this.sessionId !== params.sessionId ||
      this.projectDirectory !== params.projectDirectory;

    const wasInitialized = this.initialized;

    this.sessionId = params.sessionId;
    this.projectDirectory = params.projectDirectory;
    this.presence = params.isUserPresent;
    this.sessionIdRef.current = params.sessionId;

    if (!wasInitialized) {
      this.initialized = true;
      if (params.sessionId && params.projectDirectory) {
        void this.doFetchAndHydrate({ silent: false });
      }
      this.scheduleReconcile();
    } else if (needsReconcile) {
      this.jobsMap.clear();
      this.notifiedJobsSet.clear();
      this.notifyListeners();
      if (params.sessionId && params.projectDirectory) {
        void this.doFetchAndHydrate({ silent: false });
      }
      this.scheduleReconcile();
    } else {
      this.scheduleReconcile();
    }
  };

  refreshJobs = async (): Promise<void> => {
    await this.doFetchAndHydrate({ silent: false, isManualRefresh: true });
  };

  cancelJob = async (jobId: string): Promise<void> => {
    await invoke("cancel_background_job_command", { jobId });
  };

  deleteJob = async (jobId: string): Promise<void> => {
    await invoke("delete_background_job_command", { jobId });
  };

  clearHistory = async (daysToKeep: number = 0): Promise<void> => {
    await invoke("clear_job_history_command", { daysToKeep });
  };

  setViewedImplementationPlanId = async (id: string | null): Promise<void> => {
    if (id !== null) {
      try {
        const job = await invoke<BackgroundJob>(
          "get_background_job_by_id_command",
          { jobId: id }
        );
        if (job) {
          this.jobsMap.set(id, job);
          this.lastAccumulatedLength.set(id, (job.response || "").length);
          this.viewedImplementationPlanId = id;
          this.notifyListeners();
        }
      } catch (error) {
        console.error("Failed to fetch baseline job:", error);
      }
    } else {
      const prevId = this.viewedImplementationPlanId;
      this.viewedImplementationPlanId = null;
      if (prevId) {
        this.lastAccumulatedLength.delete(prevId);
      }
    }
  };

  private notifyListeners(): void {
    if (this.notifyTimeoutId !== null) {
      return;
    }

    this.invalidateSnapshot();

    this.notifyTimeoutId = setTimeout(() => {
      this.notifyTimeoutId = null;
      for (const listener of this.listeners) {
        listener();
      }
    }, 16);
  }

  private markEventActivity(): void {
    this.lastEventTs = Date.now();
  }

  private scheduleReconcile(): void {
    if (this.reconcileTimeoutId !== null) {
      clearTimeout(this.reconcileTimeoutId);
      this.reconcileTimeoutId = null;
    }

    if (!this.presence) {
      return;
    }

    const hasActiveJobs =
      Array.from(this.jobsMap.values()).some((job) =>
        JOB_STATUSES.ACTIVE.includes(job.status)
      ) || false;

    const baseInterval = hasActiveJobs ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
    const backoffMultiplier = Math.pow(2, Math.min(3, this.consecutiveErrors));
    const backoffInterval = Math.min(
      baseInterval * backoffMultiplier,
      MAX_BACKOFF_MS
    );
    const jitter = backoffInterval * JITTER_PCT * (Math.random() * 2 - 1);
    const effectiveInterval = Math.max(
      1000,
      Math.round(backoffInterval + jitter)
    );

    this.reconcileTimeoutId = setTimeout(() => {
      this.reconcileTimeoutId = null;
      this.reconcileLoop(effectiveInterval);
    }, effectiveInterval);
  }

  private async reconcileLoop(effectiveInterval: number): Promise<void> {
    const now = Date.now();

    const skipDueToRecentEvent = now - this.lastEventTs < RECENT_EVENT_WINDOW_MS;
    const skipDueToRecentFetch = now - this.lastFetchTs < effectiveInterval;

    if (!skipDueToRecentEvent && !skipDueToRecentFetch) {
      await this.doFetchAndHydrate({ silent: true });
    }

    this.scheduleReconcile();
  }

  private scheduleCoalescedResync(): void {
    if (this.coalescedTimeoutId !== null) {
      return;
    }

    const delay =
      COALESCE_MIN_MS +
      Math.random() * (COALESCE_MAX_MS - COALESCE_MIN_MS);

    this.coalescedTimeoutId = setTimeout(() => {
      this.coalescedTimeoutId = null;
      void this.doFetchAndHydrate({ silent: true });
    }, delay);
  }

  private async doFetchAndHydrate(opts: {
    silent: boolean;
    isManualRefresh?: boolean;
  }): Promise<void> {
    if (this.isFetching) {
      return;
    }

    this.isFetching = true;

    if (!opts.silent) {
      this.isLoading = true;
      this.notifyListeners();
    }

    try {
      const bypassCache = opts.isManualRefresh || false;
      const result = await getAllVisibleJobsAction(
        this.projectDirectory,
        this.sessionId,
        bypassCache
      );

      if (!result.isSuccess) {
        throw new Error(
          result.error?.message ||
            result.error?.toString() ||
            "Failed to fetch jobs"
        );
      }

      const fetchedJobs = result.data || [];
      this.lastFetchTs = Date.now();
      this.consecutiveErrors = 0;
      this.error = null;

      this.mergeJobs(fetchedJobs, opts.isManualRefresh || false);
    } catch (err) {
      this.consecutiveErrors += 1;
      this.error =
        err instanceof Error ? err : new Error("Failed to fetch jobs");
    } finally {
      this.isFetching = false;
      if (!opts.silent) {
        this.isLoading = false;
      }
      this.notifyListeners();
    }
  }

  private mergeJobs(fetchedJobs: BackgroundJob[], isHardSync: boolean): void {
    const fetchedMap = new Map<string, BackgroundJob>();
    for (const job of fetchedJobs) {
      fetchedMap.set(job.id, job);
    }

    const beforeSize = this.jobsMap.size;
    const beforeUpdatedAts = new Map<string, number>();
    const beforeStatuses = new Map<string, JobStatus>();

    for (const [id, job] of this.jobsMap) {
      beforeUpdatedAts.set(id, job.updatedAt || 0);
      beforeStatuses.set(id, job.status);
    }

    if (isHardSync) {
      const idsToRemove: string[] = [];
      for (const id of this.jobsMap.keys()) {
        if (!fetchedMap.has(id)) {
          idsToRemove.push(id);
        }
      }
      for (const id of idsToRemove) {
        this.jobsMap.delete(id);
      }
    } else {
      const idsToRemove: string[] = [];
      for (const [id, existingJob] of this.jobsMap) {
        if (
          !fetchedMap.has(id) &&
          JOB_STATUSES.TERMINAL.includes(existingJob.status)
        ) {
          idsToRemove.push(id);
        }
      }
      for (const id of idsToRemove) {
        this.jobsMap.delete(id);
      }
    }

    for (const [id, fetchedJob] of fetchedMap) {
      const existingJob = this.jobsMap.get(id);
      if (!existingJob) {
        this.jobsMap.set(id, fetchedJob);
      } else {
        const merged = this.resolveConflict(existingJob, fetchedJob);
        this.jobsMap.set(id, merged);
      }
    }

    const afterSize = this.jobsMap.size;
    let hasChanges = afterSize !== beforeSize;

    if (!hasChanges) {
      for (const [id, job] of this.jobsMap) {
        const beforeUpdatedAt = beforeUpdatedAts.get(id);
        const beforeStatus = beforeStatuses.get(id);
        if (
          beforeUpdatedAt !== (job.updatedAt || 0) ||
          beforeStatus !== job.status
        ) {
          hasChanges = true;
          break;
        }
      }
    }

    if (hasChanges) {
      this.notifyListeners();
    }
  }

  private resolveConflict(
    existing: BackgroundJob,
    fetched: BackgroundJob
  ): BackgroundJob {
    const existingTs = existing.updatedAt || 0;
    const fetchedTs = fetched.updatedAt || 0;

    // Both jobs active and near-simultaneous? Prefer longer response
    const bothActive = JOB_STATUSES.ACTIVE.includes(existing.status) &&
                      JOB_STATUSES.ACTIVE.includes(fetched.status);
    const nearSimultaneous = Math.abs(existingTs - fetchedTs) <= 1000;

    if (bothActive && nearSimultaneous) {
      const existingLen = existing.response?.length || 0;
      const fetchedLen = fetched.response?.length || 0;
      return fetchedLen > existingLen ? fetched : existing;
    }

    // Standard timestamp-based resolution
    if (fetchedTs > existingTs) {
      return fetched;
    } else if (existingTs > fetchedTs) {
      return existing;
    } else {
      const existingDefined = this.countDefinedFields(existing);
      const fetchedDefined = this.countDefinedFields(fetched);
      return fetchedDefined > existingDefined ? fetched : existing;
    }
  }

  private countDefinedFields(job: BackgroundJob): number {
    let count = 0;
    if (job.status) count++;
    if (job.response) count++;
    if (job.isFinalized !== undefined) count++;
    if (job.tokensSent !== undefined) count++;
    if (job.tokensReceived !== undefined) count++;
    if (job.actualCost !== null && job.actualCost !== undefined) count++;
    return count;
  }

  private setupEventListeners(): void {
    const init = async () => {
      try {
        this.unlisteners.push(
          await safeListen("job:created", (event) => {
            this.handleJobCreated(event.payload as any);
          })
        );

        this.unlisteners.push(
          await safeListen("job:deleted", (event) => {
            this.handleJobDeleted(event.payload as any);
          })
        );

        this.unlisteners.push(
          await safeListen("job:status-changed", (event) => {
            void this.handleJobStatusChanged(event.payload as any);
          })
        );

        this.unlisteners.push(
          await safeListen("job:stream-progress", (event) => {
            this.handleJobStreamProgress(event.payload as any);
          })
        );

        this.unlisteners.push(
          await safeListen("job:tokens-updated", (event) => {
            this.handleJobTokensUpdated(event.payload as any);
          })
        );

        this.unlisteners.push(
          await safeListen("job:cost-updated", (event) => {
            this.handleJobCostUpdated(event.payload as any);
          })
        );

        this.unlisteners.push(
          await safeListen("job:response-appended", (event) => {
            this.handleJobResponseAppended(event.payload as any);
          })
        );

        this.unlisteners.push(
          await safeListen("job:error-details", (event) => {
            this.handleJobErrorDetails(event.payload as any);
          })
        );

        this.unlisteners.push(
          await safeListen("job:finalized", (event) => {
            void this.handleJobFinalized(event.payload as any);
          })
        );

        this.unlisteners.push(
          await safeListen("job:metadata-updated", (event) => {
            this.handleJobMetadataUpdated(event.payload as any);
          })
        );

        this.unlisteners.push(
          await safeListen("device-link-event", (event) => {
            void this.handleDeviceLinkEvent(event.payload as any);
          })
        );
      } catch {}
    };

    void init();
  }

  private extractEventSessionId(payload: any): string | undefined {
    return payload?.sessionId ?? payload?.job?.sessionId;
  }

  private handleJobCreated(payload: any): void {
    const payloadSessionId = this.extractEventSessionId(payload);
    const shouldProcess = shouldProcessEventBySession({
      activeSessionId: this.sessionIdRef.current,
      payloadSessionId,
      requirePayloadForCreate: false,
    });

    if (!shouldProcess && payloadSessionId) {
      return;
    }

    this.markEventActivity();

    const newJob = payload.job as BackgroundJob | undefined;
    if (!newJob) {
      if (!payloadSessionId) {
        void this.fetchJobById(payload.jobId);
      }
      return;
    }

    if (EXCLUDED_WORKFLOW_TYPES.includes(newJob.taskType as any)) {
      return;
    }

    this.jobsMap.set(newJob.id, newJob);
    this.notifyListeners();

    if (JOB_STATUSES.ACTIVE.includes(newJob.status)) {
      this.scheduleCoalescedResync();
    }
  }

  private async fetchJobById(jobId: string): Promise<void> {
    try {
      const result = await invoke<BackgroundJob>(
        "get_background_job_by_id_command",
        { jobId }
      );
      if (!result) {
        return;
      }

      const job = result;
      if (
        job.sessionId !== this.sessionIdRef.current ||
        EXCLUDED_WORKFLOW_TYPES.includes(job.taskType as any)
      ) {
        return;
      }

      this.jobsMap.set(job.id, job);
      this.notifyListeners();
    } catch {}
  }

  private handleJobDeleted(payload: any): void {
    const existingJob = this.jobsMap.get(payload.jobId);
    if (existingJob) {
      this.markEventActivity();
      this.jobsMap.delete(payload.jobId);
      this.notifyListeners();
      return;
    }

    const payloadSessionId = this.extractEventSessionId(payload);
    const shouldProcess = shouldProcessEventBySession({
      activeSessionId: this.sessionIdRef.current,
      payloadSessionId,
      existingJobSessionId: undefined,
    });

    if (!shouldProcess) {
      return;
    }

    this.markEventActivity();
    if (this.jobsMap.has(payload.jobId)) {
      this.jobsMap.delete(payload.jobId);
      this.notifyListeners();
    }
  }

  private async handleJobStatusChanged(update: any): Promise<void> {
    const payloadSessionId = this.extractEventSessionId(update);
    const existingJob = this.jobsMap.get(update.jobId);
    const shouldProcess = shouldProcessEventBySession({
      activeSessionId: this.sessionIdRef.current,
      payloadSessionId,
      existingJobSessionId: existingJob?.sessionId,
    });

    if (!shouldProcess) {
      return;
    }

    this.markEventActivity();

    if (existingJob) {
      const updatedJob: BackgroundJob = {
        ...existingJob,
        status: update.status as JobStatus,
        startTime: update.startTime ?? existingJob.startTime,
        endTime: update.endTime ?? existingJob.endTime,
        subStatusMessage:
          update.subStatusMessage ?? existingJob.subStatusMessage,
        updatedAt: Date.now(),
      };
      this.jobsMap.set(update.jobId, updatedJob);
      this.notifyListeners();

      if (JOB_STATUSES.ACTIVE.includes(updatedJob.status)) {
        this.scheduleCoalescedResync();
      }
    } else {
      try {
        const result = await invoke<BackgroundJob>(
          "get_background_job_by_id_command",
          { jobId: update.jobId }
        );
        if (!result) {
          return;
        }
        const fetchedJob = result;
        if (EXCLUDED_WORKFLOW_TYPES.includes(fetchedJob.taskType as any)) {
          return;
        }
        this.jobsMap.set(fetchedJob.id, fetchedJob);
        this.notifyListeners();
      } catch {}
    }
  }

  private handleJobStreamProgress(payload: any): void {
    const payloadSessionId = this.extractEventSessionId(payload);
    const existingJob = this.jobsMap.get(payload.jobId);
    const shouldProcess = shouldProcessEventBySession({
      activeSessionId: this.sessionIdRef.current,
      payloadSessionId,
      existingJobSessionId: existingJob?.sessionId,
    });

    if (!shouldProcess || !existingJob) {
      return;
    }

    this.markEventActivity();

    let metadata: any = existingJob.metadata;
    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = {};
      }
    }
    metadata = metadata || {};

    const taskData = metadata.taskData || {};
    if (payload.progress !== undefined)
      taskData.streamProgress = payload.progress;
    if (payload.responseLength !== undefined)
      taskData.responseLength = payload.responseLength;
    if (payload.estimatedTotalLength !== undefined)
      taskData.estimatedTotalLength = payload.estimatedTotalLength;
    if (payload.lastStreamUpdateTime !== undefined)
      taskData.lastStreamUpdateTime = payload.lastStreamUpdateTime;
    if (payload.isStreaming !== undefined)
      taskData.isStreaming = payload.isStreaming;

    metadata.taskData = taskData;

    const updatedJob: BackgroundJob = {
      ...existingJob,
      metadata,
      updatedAt: Date.now(),
    };
    this.jobsMap.set(payload.jobId, updatedJob);
    this.notifyListeners();
  }

  private handleJobTokensUpdated(payload: any): void {
    const payloadSessionId = this.extractEventSessionId(payload);
    const existingJob = this.jobsMap.get(payload.jobId);
    const shouldProcess = shouldProcessEventBySession({
      activeSessionId: this.sessionIdRef.current,
      payloadSessionId,
      existingJobSessionId: existingJob?.sessionId,
    });

    if (!shouldProcess || !existingJob) {
      return;
    }

    this.markEventActivity();

    const updatedJob: BackgroundJob = {
      ...existingJob,
      tokensSent: payload.tokensSent ?? existingJob.tokensSent,
      tokensReceived: payload.tokensReceived ?? existingJob.tokensReceived,
      cacheWriteTokens: payload.cacheWriteTokens ?? existingJob.cacheWriteTokens,
      cacheReadTokens: payload.cacheReadTokens ?? existingJob.cacheReadTokens,
      updatedAt: Date.now(),
    };
    this.jobsMap.set(payload.jobId, updatedJob);
    this.notifyListeners();
  }

  private handleJobCostUpdated(payload: any): void {
    const payloadSessionId = this.extractEventSessionId(payload);
    const existingJob = this.jobsMap.get(payload.jobId);
    const shouldProcess = shouldProcessEventBySession({
      activeSessionId: this.sessionIdRef.current,
      payloadSessionId,
      existingJobSessionId: existingJob?.sessionId,
    });

    if (!shouldProcess || !existingJob) {
      return;
    }

    this.markEventActivity();

    const updatedJob: BackgroundJob = {
      ...existingJob,
      actualCost: payload.actualCost ?? existingJob.actualCost,
      isFinalized: payload.isFinalized ?? existingJob.isFinalized,
      updatedAt: Date.now(),
    };
    this.jobsMap.set(payload.jobId, updatedJob);
    this.notifyListeners();
  }

  private handleJobResponseAppended(payload: any): void {
    const payloadSessionId = this.extractEventSessionId(payload);
    const existingJob = this.jobsMap.get(payload.jobId);
    const shouldProcess = shouldProcessEventBySession({
      activeSessionId: this.sessionIdRef.current,
      payloadSessionId,
      existingJobSessionId: existingJob?.sessionId,
    });

    if (!shouldProcess || !existingJob) {
      return;
    }

    if (payload.jobId !== this.viewedImplementationPlanId) {
      return;
    }

    this.markEventActivity();

    const existing = existingJob.response || "";
    const expected = this.lastAccumulatedLength.get(payload.jobId) ?? existing.length;
    const targetTotal = typeof payload.accumulatedLength === 'number'
      ? payload.accumulatedLength
      : (existing.length + (payload.chunk?.length || 0));

    // Drop if duplicate/out-of-order
    if (targetTotal <= expected) {
      return;
    }

    // Append if clean continuation
    if (targetTotal === existing.length + (payload.chunk?.length || 0)) {
      const updatedJob: BackgroundJob = {
        ...existingJob,
        response: existing + (payload.chunk || ""),
        updatedAt: Date.now(),
      };
      this.jobsMap.set(payload.jobId, updatedJob);
      this.lastAccumulatedLength.set(payload.jobId, targetTotal);
      this.notifyListeners();
    } else {
      // Gap detected - fetch authoritative snapshot
      void this.fetchJobById(payload.jobId).then(() => {
        const refetched = this.jobsMap.get(payload.jobId);
        if (refetched) {
          this.lastAccumulatedLength.set(payload.jobId, (refetched.response || "").length);
        }
      });
    }
  }

  private handleJobErrorDetails(payload: any): void {
    const payloadSessionId = this.extractEventSessionId(payload);
    const existingJob = this.jobsMap.get(payload.jobId);
    const shouldProcess = shouldProcessEventBySession({
      activeSessionId: this.sessionIdRef.current,
      payloadSessionId,
      existingJobSessionId: existingJob?.sessionId,
    });

    if (!shouldProcess || !existingJob) {
      return;
    }

    this.markEventActivity();

    const updatedJob: BackgroundJob = {
      ...existingJob,
      errorDetails: payload.errorDetails,
      updatedAt: Date.now(),
    };
    this.jobsMap.set(payload.jobId, updatedJob);
    this.notifyListeners();
  }

  private async handleJobFinalized(payload: any): Promise<void> {
    const payloadSessionId = this.extractEventSessionId(payload);
    const existingJob = this.jobsMap.get(payload.jobId);
    const shouldProcess = shouldProcessEventBySession({
      activeSessionId: this.sessionIdRef.current,
      payloadSessionId,
      existingJobSessionId: existingJob?.sessionId,
    });

    if (!shouldProcess || !existingJob) {
      return;
    }

    this.markEventActivity();

    let finalResponse = payload.response;

    if (
      !finalResponse &&
      existingJob.taskType === "video_analysis"
    ) {
      try {
        const result = await invoke<BackgroundJob>(
          "get_background_job_by_id_command",
          { jobId: payload.jobId }
        );
        if (result) {
          finalResponse = result.response;
        }
      } catch {}
    }

    const updatedJob: BackgroundJob = {
      ...existingJob,
      status: payload.status as JobStatus,
      response: finalResponse ?? existingJob.response,
      actualCost: payload.actualCost ?? null,
      tokensSent: payload.tokensSent ?? existingJob.tokensSent,
      tokensReceived: payload.tokensReceived ?? existingJob.tokensReceived,
      cacheReadTokens: payload.cacheReadTokens ?? existingJob.cacheReadTokens,
      cacheWriteTokens:
        payload.cacheWriteTokens ?? existingJob.cacheWriteTokens,
      isFinalized: true,
      updatedAt: Date.now(),
    };
    this.jobsMap.set(payload.jobId, updatedJob);
    this.lastAccumulatedLength.delete(payload.jobId);
    this.notifyListeners();
  }

  private handleJobMetadataUpdated(payload: any): void {
    const payloadSessionId = this.extractEventSessionId(payload);
    const existingJob = this.jobsMap.get(payload.jobId);
    const shouldProcess = shouldProcessEventBySession({
      activeSessionId: this.sessionIdRef.current,
      payloadSessionId,
      existingJobSessionId: existingJob?.sessionId,
    });

    if (!shouldProcess || !existingJob) {
      return;
    }

    this.markEventActivity();

    let metadata: any = existingJob.metadata;
    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = {};
      }
    }
    metadata = metadata || {};

    for (const [key, value] of Object.entries(payload.metadataPatch)) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        metadata[key] &&
        typeof metadata[key] === "object"
      ) {
        metadata[key] = { ...metadata[key], ...value };
      } else {
        metadata[key] = value;
      }
    }

    const updatedJob: BackgroundJob = {
      ...existingJob,
      metadata,
      updatedAt: Date.now(),
    };
    this.jobsMap.set(payload.jobId, updatedJob);
    this.notifyListeners();
  }

  private async handleDeviceLinkEvent(event: any): Promise<void> {
    const { type, payload } = event || {};

    if (typeof type !== "string" || !type.startsWith("job:")) {
      return;
    }

    switch (type) {
      case "job:created":
        this.handleJobCreated(payload);
        break;
      case "job:deleted":
        this.handleJobDeleted(payload);
        break;
      case "job:status-changed":
        await this.handleJobStatusChanged(payload);
        break;
    }
  }

  destroy(): void {
    if (this.reconcileTimeoutId !== null) {
      clearTimeout(this.reconcileTimeoutId);
      this.reconcileTimeoutId = null;
    }
    if (this.coalescedTimeoutId !== null) {
      clearTimeout(this.coalescedTimeoutId);
      this.coalescedTimeoutId = null;
    }
    if (this.notifyTimeoutId !== null) {
      clearTimeout(this.notifyTimeoutId);
      this.notifyTimeoutId = null;
    }
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
    this.lastAccumulatedLength.clear();
    this.listeners.clear();
  }
}

export const jobsStore = new JobsStore();
