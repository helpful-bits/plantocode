"use client";

import { Loader2, Pencil, Check, X, Copy, Trash2 } from "lucide-react";
import { useRef, useEffect } from "react";

import { type Session } from "@/types/session-types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/ui/alert-dialog";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";

import type { MouseEvent } from "react";

export interface SessionListItemProps {
  session: Session;
  isActive: boolean;
  isEditing: boolean;
  editInputName: string;
  isLoading: boolean;
  isSessionLoading: boolean;
  globalIsSwitching: boolean;
  disabled: boolean;
  onLoad: (session: Session) => void;
  onStartEdit: (session: Session, event: React.MouseEvent) => void;
  onCancelEdit: (event?: React.MouseEvent | React.KeyboardEvent) => void;
  onUpdateName: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onClone: (session: Session, event: React.MouseEvent) => void;
  onEditInputChange: (value: string) => void;
}

const SessionListItem = ({
  session,
  isActive,
  isEditing,
  editInputName,
  isLoading,
  isSessionLoading,
  globalIsSwitching,
  disabled,
  onLoad,
  onStartEdit,
  onCancelEdit,
  onUpdateName,
  onDelete,
  onClone,
  onEditInputChange,
}: SessionListItemProps) => {
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setTimeout(() => editInputRef.current?.focus(), 0);
    }
  }, [isEditing]);
  return (
    <div
      className={`
        flex items-center justify-between p-2 border-b last:border-0
        ${isActive ? "bg-accent" : "hover:bg-muted/80"}
        ${globalIsSwitching ? "opacity-80 cursor-not-allowed" : "cursor-pointer"}
        ${isSessionLoading && isActive ? "border-l-4 border-l-primary" : ""}
        transition-all duration-200
      `}
      onClick={() => !globalIsSwitching && onLoad(session)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (!globalIsSwitching) {
            onLoad(session);
          }
        }
      }}
    >
      {isEditing ? (
        <div className="flex-1 flex items-center mr-2">
          <Input
            ref={editInputRef}
            value={editInputName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onEditInputChange(e.target.value)
            }
            onClick={(e: React.MouseEvent<HTMLInputElement>) =>
              e.stopPropagation()
            }
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                onUpdateName(session.id);
              } else if (e.key === "Escape") {
                onCancelEdit(e);
              }
            }}
            className="h-8 text-sm"
            disabled={globalIsSwitching || isLoading || disabled}
          />
          <div className="flex items-center gap-1 ml-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 rounded-sm"
              isLoading={isLoading}
              disabled={globalIsSwitching || disabled}
              onClick={(e: MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                onUpdateName(session.id);
              }}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 rounded-sm"
              disabled={globalIsSwitching || isLoading || disabled}
              onClick={onCancelEdit}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center">
            <span className="text-sm font-medium truncate max-w-[250px] text-foreground">
              {session.name || "Untitled Session"}
            </span>
            {isSessionLoading && isActive && (
              <div className="ml-2 flex items-center text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(session.updatedAt || Date.now()).toLocaleString()}
          </span>
        </div>
      )}

      {!isEditing && (
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-sm"
            onClick={(e: MouseEvent<HTMLButtonElement>) => onClone(session, e)}
            title="Clone session"
            isLoading={isLoading}
            disabled={globalIsSwitching || disabled}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-sm"
            onClick={(e: MouseEvent<HTMLButtonElement>) => onStartEdit(session, e)}
            title="Rename session"
            disabled={globalIsSwitching || isLoading || disabled}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive rounded-sm"
                onClick={(e: MouseEvent<HTMLButtonElement>) =>
                  e.stopPropagation()
                }
                title="Delete session"
                disabled={globalIsSwitching || isLoading || disabled}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Session</AlertDialogTitle>
                <AlertDialogDescription className="text-balance">
                  This will permanently delete the session &quot;
                  {session.name || "Untitled Session"}&quot;. This action cannot
                  be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={(e: MouseEvent<HTMLButtonElement>) =>
                    e.stopPropagation()
                  }
                  disabled={isLoading || disabled}
                >
                  Cancel
                </AlertDialogCancel>
                <Button
                  onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    onDelete(session.id);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  isLoading={isLoading}
                  loadingText="Deleting..."
                  disabled={disabled}
                >
                  Delete
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
};

SessionListItem.displayName = "SessionListItem";

export default SessionListItem;
