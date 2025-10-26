"use client";

import { useContext, useState, useMemo } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { BackgroundJobsContext } from "@/contexts/background-jobs";
import { useTerminalSessions } from "@/contexts/terminal-sessions/useTerminalSessions";
import { ArrowLeft, Terminal, Circle, CheckCircle, XCircle, AlertTriangle, Clock, Search } from "lucide-react";

interface MonitoringPanelProps {
  onBack: () => void;
  onOpenTerminal: (jobId: string) => void;
}

export const MonitoringPanel = ({ onBack, onOpenTerminal }: MonitoringPanelProps) => {
  const { jobs } = useContext(BackgroundJobsContext);
  const { sessions, getSession, getActiveCount, getAttention } = useTerminalSessions();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter active terminal sessions
  const activeSessions = useMemo(() =>
    Array.from(sessions.values()).filter(s =>
      ['running','restored','starting','initializing'].includes(s.status) || s.isMinimized
    ), [sessions]);

  // Filter only implementation plan jobs
  const allImplementationPlanJobs = useMemo(() =>
    jobs.filter(job =>
      job.taskType === "implementation_plan" ||
      job.taskType === "implementation_plan_merge"
    ), [jobs]);

  // Filter available sessions (completed implementation plans without active terminals)
  const availableSessions = useMemo(() =>
    allImplementationPlanJobs.filter(job =>
      job.status === 'completed' &&
      !sessions.has(job.id)
    ), [allImplementationPlanJobs, sessions]);

  // Handle session click
  const handleSessionClick = (sessionId: string) => {
    // Check if a background job exists with this id
    const job = jobs.find(j => j.id === sessionId);
    if (job) {
      onOpenTerminal(sessionId);
    } else {
      window.dispatchEvent(new CustomEvent('open-terminal-session', { detail: { sessionId } }));
    }
  };

  // Get status badge for terminal session
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return { text: "Running", className: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300" };
      case "restored":
        return { text: "Restored", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" };
      case "starting":
      case "initializing":
        return { text: "Starting", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300" };
      case "completed":
        return { text: "Completed", className: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300" };
      case "failed":
        return { text: "Error", className: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300" };
      default:
        return { text: "Inactive", className: "bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300" };
    }
  };

  // Filter and sort jobs based on search query
  const implementationPlanJobs = useMemo(() => {
    let filteredJobs = allImplementationPlanJobs;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredJobs = allImplementationPlanJobs.filter(job => {
        // Search in job metadata for title/description
        try {
          const metadata = typeof job.metadata === 'string'
            ? JSON.parse(job.metadata)
            : job.metadata || {};
          // Check for title in multiple places: planTitle, generated_title, displayName
          const title = metadata.planTitle || metadata.generated_title || metadata.displayName || "";
          const description = metadata.description || "";
          const jobType = job.taskType === "implementation_plan_merge" ? "merge plan" : "implementation plan";

          return (
            title.toLowerCase().includes(query) ||
            description.toLowerCase().includes(query) ||
            jobType.includes(query) ||
            job.id.toLowerCase().includes(query) ||
            job.status.toLowerCase().includes(query)
          );
        } catch {
          // Fallback to basic search if metadata parsing fails
          const jobType = job.taskType === "implementation_plan_merge" ? "merge plan" : "implementation plan";
          return (
            jobType.includes(query) ||
            job.id.toLowerCase().includes(query) ||
            job.status.toLowerCase().includes(query)
          );
        }
      });
    }

    // Sort with active statuses first, then by updatedAt/createdAt descending
    return filteredJobs.sort((a, b) => {
      const activeStatuses = ['running', 'queued', 'processing', 'generating'];
      const aIsActive = activeStatuses.includes(a.status);
      const bIsActive = activeStatuses.includes(b.status);

      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;

      // Secondary sort by timestamp descending
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [allImplementationPlanJobs, searchQuery]);

  const getJobStatusWithAttention = (job: any) => {
    const session = getSession(job.id);
    const attention = getAttention(job.id);

    // Attention takes precedence
    if (attention && attention.level) {
      const attentionColors = {
        high: 'text-red-500',
        medium: 'text-yellow-500',
        low: 'text-blue-500'
      };
      return {
        icon: (
          <AlertTriangle
            className={`w-3.5 h-3.5 ${attentionColors[attention.level]}`}
          />
        ),
        badge: {
          text: attention.level === 'high' ? 'Agent requires attention' : attention.level === 'medium' ? 'Agent idle' : 'Needs input',
          variant: attention.level === 'high' ? 'destructive' : attention.level === 'medium' ? 'warning' : 'info'
        }
      };
    }

    // Terminal status
    if (session) {
      switch (session.status) {
        case "running":
          return { icon: <Circle className="w-3.5 h-3.5 text-success animate-pulse" />, badge: null };
        case "completed":
          return { icon: <CheckCircle className="w-3.5 h-3.5 text-success" />, badge: null };
        case "failed":
          return { icon: <AlertTriangle className="w-3.5 h-3.5 text-destructive" />, badge: null };
        case "agent_requires_attention":
          return { icon: <Clock className="w-3.5 h-3.5 text-warning" />, badge: null };
        default:
          return { icon: <Circle className="w-3.5 h-3.5 text-muted-foreground" />, badge: null };
      }
    }

    // Job status fallback
    if (job.status === "completed") {
      return { icon: <CheckCircle className="w-3.5 h-3.5 text-success" />, badge: null };
    } else if (job.status === "failed") {
      return { icon: <AlertTriangle className="w-3.5 h-3.5 text-destructive" />, badge: null };
    } else {
      return { icon: <Circle className="w-3.5 h-3.5 text-muted-foreground" />, badge: null };
    }
  };

  // Count statuses for summary (use all jobs, not filtered)
  const activeJobs = allImplementationPlanJobs.filter(j => j.status === "running" || j.status === "queued");
  const completedJobs = allImplementationPlanJobs.filter(j => j.status === "completed");
  const failedJobs = allImplementationPlanJobs.filter(j => j.status === "failed");
  const activeTerminals = getActiveCount();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b border-border/60">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-foreground hover:bg-accent/20">
          <ArrowLeft className="w-3 h-3" />
          Back
        </Button>
        <div className="text-sm font-medium text-foreground">Implementation Plans Monitor</div>
      </div>
      
      <div className="p-3 space-y-4 overflow-auto flex-1">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search implementation plans..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-card border-border/60"
          />
        </div>

        <section className="space-y-2">
          <div className="text-sm font-medium text-foreground">Summary</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 border border-border/60 rounded-md bg-card">
              <div className="font-medium text-muted-foreground">Active Plans</div>
              <div className="text-lg font-semibold text-foreground">{activeJobs.length}</div>
            </div>
            <div className="p-2 border border-border/60 rounded-md bg-card">
              <div className="font-medium text-muted-foreground">Active Terminals</div>
              <div className="text-lg font-semibold text-foreground">{activeTerminals}</div>
            </div>
            <div className="p-2 border border-border/60 rounded-md bg-card">
              <div className="font-medium text-muted-foreground">Completed</div>
              <div className="text-lg font-semibold text-foreground">
                {completedJobs.length}
                {completedJobs.length > 0 && (
                  <CheckCircle className="inline-block w-3.5 h-3.5 ml-1 text-success" />
                )}
              </div>
            </div>
            <div className="p-2 border border-border/60 rounded-md bg-card">
              <div className="font-medium text-muted-foreground">Failed</div>
              <div className="text-lg font-semibold text-foreground">
                {failedJobs.length}
                {failedJobs.length > 0 && (
                  <XCircle className="inline-block w-3.5 h-3.5 ml-1 text-destructive" />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Active Terminal Sessions */}
        {activeSessions.length > 0 && (
          <section className="space-y-2">
            <div className="text-sm font-medium text-foreground">Active Terminal Sessions</div>
            <div className="space-y-2">
              {activeSessions.map(session => {
                const statusBadge = getStatusBadge(session.status);
                const displayName = session.displayName ?? session.sessionId;

                return (
                  <div
                    key={session.sessionId}
                    className="group flex items-start gap-3 border border-border/60 rounded-md p-3 bg-card hover:bg-accent/5 transition-colors cursor-pointer"
                    onClick={() => handleSessionClick(session.sessionId)}
                  >
                    {/* Status icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      <Circle className="w-3.5 h-3.5 text-success animate-pulse" />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Session name and status */}
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-foreground truncate">
                          {displayName}
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${statusBadge.className}`}>
                          {statusBadge.text}
                        </span>
                      </div>

                      {/* Last activity timestamp */}
                      {session.lastActivityAt && (
                        <div className="text-xs text-muted-foreground">
                          Last activity: {new Date(session.lastActivityAt).toLocaleTimeString()}
                        </div>
                      )}

                      {/* Session ID if no display name */}
                      {!session.displayName && (
                        <div className="text-xs text-muted-foreground/60">
                          {session.sessionId.slice(0, 8)}
                        </div>
                      )}
                    </div>

                    {/* Terminal indicator */}
                    <div className="flex-shrink-0 mt-0.5">
                      <Terminal className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Available Sessions */}
        {availableSessions.length > 0 && (
          <section className="space-y-2">
            <div className="text-sm font-medium text-foreground">Available Sessions</div>
            <div className="space-y-2">
              {availableSessions.map(job => {
                let planTitle = "";
                try {
                  const metadata = typeof job.metadata === 'string'
                    ? JSON.parse(job.metadata)
                    : job.metadata || {};
                  planTitle = metadata.planTitle || metadata.generated_title || metadata.displayName || "";
                } catch {
                  // Ignore parsing errors
                }

                const displayTitle = planTitle ||
                  (job.taskType === "implementation_plan_merge" ? "Merge Plan" : "Implementation Plan");

                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between gap-3 border border-border/60 rounded-md p-3 bg-card hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {displayTitle}
                      </div>
                      {!planTitle && (
                        <div className="text-xs text-muted-foreground/60">
                          {job.id.slice(0, 8)}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenTerminal(job.id)}
                      className="flex-shrink-0 gap-1 h-7 text-xs"
                    >
                      <Terminal className="w-3 h-3" />
                      Start
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-foreground">Implementation Plans</div>
            {searchQuery && (
              <div className="text-xs text-muted-foreground">
                {implementationPlanJobs.length} of {allImplementationPlanJobs.length} plans
              </div>
            )}
          </div>
          {implementationPlanJobs.length > 0 ? (
            <div className="space-y-2">
              {implementationPlanJobs.map(job => {
                let planTitle = "";
                let planDescription = "";
                try {
                  const metadata = typeof job.metadata === 'string'
                    ? JSON.parse(job.metadata)
                    : job.metadata || {};
                  // Check for title in multiple places: planTitle, generated_title, displayName
                  planTitle = metadata.planTitle || metadata.generated_title || metadata.displayName || "";
                  planDescription = metadata.description || "";
                } catch {
                  // Ignore parsing errors
                }

                // Use a meaningful display title
                const displayTitle = planTitle || planDescription ||
                  (job.taskType === "implementation_plan_merge" ? "Merge Plan" : "Implementation Plan");

                // Determine if this is a merge plan for badge
                const isMergePlan = job.taskType === "implementation_plan_merge";

                // Get status and attention info
                const statusInfo = getJobStatusWithAttention(job);

                // Get session for last output
                const session = getSession(job.id);
                const lastOutput = session?.lastOutput?.trim();
                const outputSnippet = lastOutput ?
                  (lastOutput.length > 50 ? lastOutput.slice(0, 50) + '...' : lastOutput) : null;

                return (
                  <div
                    key={job.id}
                    className="group flex items-start gap-3 border border-border/60 rounded-md p-3 bg-card hover:bg-accent/5 transition-colors cursor-pointer"
                    onClick={() => onOpenTerminal(job.id)}
                  >
                    {/* Status icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {statusInfo.icon}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Title and badges row */}
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-foreground truncate">
                          {displayTitle}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {statusInfo.badge && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              statusInfo.badge.variant === 'destructive' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300' :
                              statusInfo.badge.variant === 'warning' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300' :
                              'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                            }`}>
                              {statusInfo.badge.text}
                            </span>
                          )}
                          {isMergePlan && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              Merge
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Last output snippet */}
                      {outputSnippet && (
                        <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded">
                          {outputSnippet}
                        </div>
                      )}

                      {/* Job ID if no title */}
                      {!planTitle && (
                        <div className="text-xs text-muted-foreground/60">
                          {job.id.slice(0, 8)}
                        </div>
                      )}
                    </div>

                    {/* Terminal indicator */}
                    <div className="flex-shrink-0 mt-0.5">
                      <Terminal className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground p-4 border border-border/60 rounded-md text-center bg-card">
              {searchQuery 
                ? `No implementation plans matching "${searchQuery}"`
                : "No implementation plans found"}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};