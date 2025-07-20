"use client";

import React from "react";
import { Loader2, Pencil, Copy, Trash2, Check, X } from "lucide-react";

import { type Session } from "@/types/session-types";
import { AlertDialog, AlertDialogTrigger } from "@/ui/alert-dialog";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";

interface SessionListProps {
  sessions: Session[];
  activeSessionId: string | null;
  editingSessionId: string | null;
  editSessionNameInput: string;
  onLoadSession: (session: Session) => void;
  onStartEdit: (session: Session, e: React.MouseEvent) => void;
  onCloneSession: (session: Session, e: React.MouseEvent) => void;
  onSaveEdit: (sessionId: string) => void;
  onCancelEdit: (e?: React.MouseEvent | React.KeyboardEvent) => void;
  onEditInputChange: (value: string) => void;
  isLoading: boolean;
  disabled: boolean;
  globalIsSwitching: boolean;
  renderDeleteDialog: (sessionId: string, sessionName: string) => React.ReactElement;
  totalSessionCount: number;
  searchQuery: string;
}

const SessionList = ({
  sessions,
  activeSessionId,
  editingSessionId,
  editSessionNameInput,
  onLoadSession,
  onStartEdit,
  onCloneSession,
  // onDeleteSession is not used since renderDeleteDialog is provided instead
  onSaveEdit,
  onCancelEdit,
  onEditInputChange,
  isLoading,
  disabled,
  globalIsSwitching,
  renderDeleteDialog,
  totalSessionCount,
  searchQuery,
}: SessionListProps) => {
  if (isLoading && totalSessionCount === 0) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">
          Loading sessions...
        </span>
      </div>
    );
  }

  if (totalSessionCount === 0 && !isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No saved sessions for this project.
      </div>
    );
  }

  if (sessions.length === 0 && searchQuery) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No sessions match your search.
      </div>
    );
  }

  return (
    <div className="max-h-[200px] overflow-y-auto">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`
            flex items-center justify-between p-2 border-b border-border/60 last:border-b-0
            ${activeSessionId === session.id ? "bg-accent" : "hover:bg-muted/80"}
            ${globalIsSwitching ? "opacity-80 cursor-not-allowed" : "cursor-pointer"}
            ${isLoading && activeSessionId === session.id ? "border-l-4 border-l-primary" : ""}
            transition-all duration-200
          `}
          onClick={() => !globalIsSwitching && onLoadSession(session)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (editingSessionId === session.id) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!globalIsSwitching) {
                onLoadSession(session);
              }
            }
          }}
        >
          {editingSessionId === session.id ? (
            <div className="flex-1 flex items-center mr-2">
              <Input
                value={editSessionNameInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onEditInputChange(e.target.value)
                }
                onClick={(e: React.MouseEvent<HTMLInputElement>) =>
                  e.stopPropagation()
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    onSaveEdit(session.id);
                  } else if (e.key === "Escape") {
                    onCancelEdit(e);
                  }
                }}
                className="h-8 text-sm"
                disabled={globalIsSwitching || isLoading || disabled}
              />
              <div className="flex items-center gap-1 ml-2">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  isLoading={isLoading}
                  disabled={globalIsSwitching || disabled}
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    onSaveEdit(session.id);
                  }}
                >
                  <Check className="h-3.5 w-3.5 text-foreground" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  disabled={globalIsSwitching || isLoading || disabled}
                  onClick={onCancelEdit}
                >
                  <X className="h-3.5 w-3.5 text-foreground" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center">
                <span className="text-sm font-medium truncate max-w-[250px] text-foreground">
                  {session.name || "Untitled Session"}
                </span>
                {isLoading && activeSessionId === session.id && (
                  <div className="ml-2 flex items-center text-primary">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(session.updatedAt || Date.now()).toLocaleString()}
              </span>
            </div>
          )}

          {editingSessionId !== session.id && (
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={(e: React.MouseEvent) => onCloneSession(session, e)}
                title="Clone session"
                isLoading={isLoading}
                disabled={globalIsSwitching || disabled}
              >
                <Copy className="h-3.5 w-3.5 text-foreground" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={(e: React.MouseEvent) => onStartEdit(session, e)}
                title="Rename session"
                disabled={globalIsSwitching || isLoading || disabled}
              >
                <Pencil className="h-3.5 w-3.5 text-foreground" />
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
                      e.stopPropagation()
                    }
                    title="Delete session"
                    disabled={globalIsSwitching || isLoading || disabled}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                {renderDeleteDialog(
                  session.id,
                  session.name || "Untitled Session"
                )}
              </AlertDialog>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

SessionList.displayName = "SessionList";

export default SessionList;
