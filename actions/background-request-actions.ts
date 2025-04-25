"use server";

import { ActionState, GeminiRequest } from "@/types";
import { sessionRepository } from "@/lib/db";
import { notFound } from "next/navigation";

/**
 * Action to get all active Gemini requests across all sessions
 */
export async function getActiveRequestsAction(): Promise<ActionState<GeminiRequest[]>> {
  try {
    // Initialize the repository if needed
    if (!sessionRepository) {
      return {
        isSuccess: false,
        message: "Database not available",
        data: []
      };
    }

    // Fetch all non-cleared requests from the repository
    const visibleRequests = await sessionRepository.getAllVisibleGeminiRequests();

    return {
      isSuccess: true,
      message: "Successfully fetched requests",
      data: visibleRequests
    };
  } catch (error) {
    console.error("Error fetching requests:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error fetching requests",
      data: []
    };
  }
}

/**
 * Action to clear completed, failed, or canceled request history
 */
export async function clearRequestHistoryAction(): Promise<ActionState<null>> {
  try {
    // Initialize the repository if needed
    if (!sessionRepository) {
      return {
        isSuccess: false,
        message: "Database not available",
        data: null
      };
    }

    // Clear request history using the repository
    await sessionRepository.clearGeminiRequestHistory();

    return {
      isSuccess: true,
      message: "Successfully cleared request history",
      data: null
    };
  } catch (error) {
    console.error("Error clearing request history:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error clearing request history",
      data: null
    };
  }
}

/**
 * Action to update the cleared status of a specific request
 */
export async function updateRequestClearedStatusAction(
  requestId: string,
  cleared: boolean
): Promise<ActionState<null>> {
  try {
    // Initialize the repository if needed
    if (!sessionRepository) {
      return {
        isSuccess: false,
        message: "Database not available",
        data: null
      };
    }

    // Update the cleared status using the repository
    await sessionRepository.updateRequestClearedStatus(requestId, cleared);

    return {
      isSuccess: true,
      message: `Successfully ${cleared ? "cleared" : "restored"} request`,
      data: null
    };
  } catch (error) {
    console.error(`Error updating cleared status for request ${requestId}:`, error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error updating request status",
      data: null
    };
  }
} 