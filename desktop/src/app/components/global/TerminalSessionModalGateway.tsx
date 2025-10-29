"use client";
import { useEffect, useState } from "react";
import { GenericTerminalModal } from "@/app/components/background-jobs-sidebar/_components/GenericTerminalModal";

type OpenTerminalEvent = CustomEvent<{ sessionId: string; title?: string }>;

export default function TerminalSessionModalGateway() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as OpenTerminalEvent;
      setSessionId(ce.detail.sessionId);
      setTitle(ce.detail.title);
      setOpen(true);
    };
    window.addEventListener("open-terminal-session", handler as EventListener);
    return () => {
      window.removeEventListener("open-terminal-session", handler as EventListener);
    };
  }, []);

  return (
    <GenericTerminalModal
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSessionId(null);
          setTitle(undefined);
        }
      }}
      sessionId={sessionId}
      title={title ?? "Terminal"}
    />
  );
}
