import Foundation

// MARK: - Jobs Reconcile Reason

/// Reason for reconciling/fetching job snapshots
public enum JobsReconcileReason: Equatable {
    /// Initial load when view appears
    case initialLoad
    /// App returned to foreground
    case foregroundResume
    /// Connectivity was restored after disconnection
    case connectivityReconnected
    /// Push notification hint to refresh
    case pushHint
    /// Manual user-initiated refresh
    case userRefresh
    /// Periodic background sync
    case periodicSync
    /// Session changed
    case sessionChanged
}

// MARK: - Jobs Decoding

public struct JobsDecoding {

    public enum DecodingError: Error, LocalizedError {
        case missingJobsArray
        case missingJobKey
        case invalidJobData
        case decodingFailed(underlying: Error)

        public var errorDescription: String? {
            switch self {
            case .missingJobsArray:
                return "Response missing 'jobs' array"
            case .missingJobKey:
                return "Response missing 'job' key"
            case .invalidJobData:
                return "Invalid job data format"
            case .decodingFailed(let underlying):
                return "Job decoding failed: \(underlying.localizedDescription)"
            }
        }
    }

    /// Shared decoder configured for job responses
    /// Backend uses camelCase and millisecond timestamps
    private static var jobDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        // Backend sends timestamps as milliseconds since epoch
        // BackgroundJob stores Int64 timestamps directly, so no date strategy needed
        return decoder
    }

    public static func decodeJob(dict: [String: Any]) throws -> BackgroundJob {
        let jsonData = try JSONSerialization.data(withJSONObject: dict)
        do {
            return try jobDecoder.decode(BackgroundJob.self, from: jsonData)
        } catch {
            throw DecodingError.decodingFailed(underlying: error)
        }
    }

    /// Decodes a job list response with flexible format handling
    /// Supports both `{"jobs": [...]}` wrapper and direct array `[...]` formats
    public static func decodeJobList(dict: [String: Any]) throws -> JobListResponse {
        guard let jobsArray = dict["jobs"] as? [[String: Any]] else {
            throw DecodingError.missingJobsArray
        }

        let jsonData = try JSONSerialization.data(withJSONObject: jobsArray)
        let jobs: [BackgroundJob]
        do {
            jobs = try jobDecoder.decode([BackgroundJob].self, from: jsonData)
        } catch {
            throw DecodingError.decodingFailed(underlying: error)
        }

        let totalCount = dict["totalCount"] as? Int ?? jobs.count
        let page = dict["page"] as? Int ?? 0
        let pageSize = dict["pageSize"] as? Int ?? jobs.count
        let hasMore = dict["hasMore"] as? Bool ?? false

        return JobListResponse(
            jobs: jobs,
            totalCount: UInt32(totalCount),
            page: UInt32(page),
            pageSize: UInt32(pageSize),
            hasMore: hasMore
        )
    }

    /// Decodes a job list from a flexible response format
    /// Handles both wrapped `{"jobs": [...]}` and direct array `[...]` formats
    public static func decodeJobListFlexible(from data: Any) throws -> [BackgroundJob] {
        // Handle dictionary with "jobs" key
        if let dict = data as? [String: Any] {
            if let jobsArray = dict["jobs"] as? [[String: Any]] {
                let jsonData = try JSONSerialization.data(withJSONObject: jobsArray)
                return try jobDecoder.decode([BackgroundJob].self, from: jsonData)
            }
            // Single job in a wrapper
            if let _ = dict["id"] as? String {
                let jsonData = try JSONSerialization.data(withJSONObject: dict)
                let job = try jobDecoder.decode(BackgroundJob.self, from: jsonData)
                return [job]
            }
            throw DecodingError.missingJobsArray
        }

        // Handle direct array
        if let array = data as? [[String: Any]] {
            let jsonData = try JSONSerialization.data(withJSONObject: array)
            return try jobDecoder.decode([BackgroundJob].self, from: jsonData)
        }

        throw DecodingError.invalidJobData
    }

    public static func decodeJobEnvelope(dict: [String: Any]) throws -> BackgroundJob {
        guard let jobData = dict["job"] as? [String: Any] else {
            throw DecodingError.missingJobKey
        }
        return try decodeJob(dict: jobData)
    }
}
