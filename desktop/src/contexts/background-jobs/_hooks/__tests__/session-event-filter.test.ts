import { describe, it, expect } from "vitest";
import {
  shouldProcessEventBySession,
  type SessionFilterInput,
} from "../session-event-filter";

describe("shouldProcessEventBySession", () => {
  describe("no active session", () => {
    it("should reject events when activeSessionId is undefined", () => {
      const input: SessionFilterInput = {
        activeSessionId: undefined,
        payloadSessionId: "session-123",
        requirePayloadForCreate: false,
      };
      expect(shouldProcessEventBySession(input)).toBe(false);
    });

    it("should reject create events when activeSessionId is undefined", () => {
      const input: SessionFilterInput = {
        activeSessionId: undefined,
        payloadSessionId: "session-123",
        requirePayloadForCreate: true,
      };
      expect(shouldProcessEventBySession(input)).toBe(false);
    });
  });

  describe("create events (requirePayloadForCreate=true)", () => {
    it("should accept when payload session matches active session", () => {
      const input: SessionFilterInput = {
        activeSessionId: "session-123",
        payloadSessionId: "session-123",
        requirePayloadForCreate: true,
      };
      expect(shouldProcessEventBySession(input)).toBe(true);
    });

    it("should reject when payload session does not match active session", () => {
      const input: SessionFilterInput = {
        activeSessionId: "session-123",
        payloadSessionId: "session-456",
        requirePayloadForCreate: true,
      };
      expect(shouldProcessEventBySession(input)).toBe(false);
    });

    it("should reject when payload session is missing", () => {
      const input: SessionFilterInput = {
        activeSessionId: "session-123",
        payloadSessionId: undefined,
        requirePayloadForCreate: true,
      };
      expect(shouldProcessEventBySession(input)).toBe(false);
    });

    it("should reject when payload session is missing even with existing job session", () => {
      const input: SessionFilterInput = {
        activeSessionId: "session-123",
        payloadSessionId: undefined,
        existingJobSessionId: "session-123",
        requirePayloadForCreate: true,
      };
      expect(shouldProcessEventBySession(input)).toBe(false);
    });
  });

  describe("update/delete events (requirePayloadForCreate=false)", () => {
    it("should accept when payload session matches active session", () => {
      const input: SessionFilterInput = {
        activeSessionId: "session-123",
        payloadSessionId: "session-123",
        requirePayloadForCreate: false,
      };
      expect(shouldProcessEventBySession(input)).toBe(true);
    });

    it("should reject when payload session does not match active session", () => {
      const input: SessionFilterInput = {
        activeSessionId: "session-123",
        payloadSessionId: "session-456",
        requirePayloadForCreate: false,
      };
      expect(shouldProcessEventBySession(input)).toBe(false);
    });

    it("should fallback to existing job session when payload session is missing", () => {
      const input: SessionFilterInput = {
        activeSessionId: "session-123",
        payloadSessionId: undefined,
        existingJobSessionId: "session-123",
        requirePayloadForCreate: false,
      };
      expect(shouldProcessEventBySession(input)).toBe(true);
    });

    it("should reject when existing job session does not match", () => {
      const input: SessionFilterInput = {
        activeSessionId: "session-123",
        payloadSessionId: undefined,
        existingJobSessionId: "session-456",
        requirePayloadForCreate: false,
      };
      expect(shouldProcessEventBySession(input)).toBe(false);
    });

    it("should reject when both payload and existing job session are missing", () => {
      const input: SessionFilterInput = {
        activeSessionId: "session-123",
        payloadSessionId: undefined,
        existingJobSessionId: undefined,
        requirePayloadForCreate: false,
      };
      expect(shouldProcessEventBySession(input)).toBe(false);
    });

    it("should prefer payload session over existing job session", () => {
      const input: SessionFilterInput = {
        activeSessionId: "session-123",
        payloadSessionId: "session-123",
        existingJobSessionId: "session-456",
        requirePayloadForCreate: false,
      };
      expect(shouldProcessEventBySession(input)).toBe(true);
    });

    it("should reject if payload session mismatches even with matching existing job session", () => {
      const input: SessionFilterInput = {
        activeSessionId: "session-123",
        payloadSessionId: "session-999",
        existingJobSessionId: "session-123",
        requirePayloadForCreate: false,
      };
      expect(shouldProcessEventBySession(input)).toBe(false);
    });
  });
});
