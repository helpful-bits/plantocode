import Foundation

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
    /// Returns lightweight BackgroundJobListItem summaries (not full BackgroundJob)
    public static func decodeJobList(dict: [String: Any]) throws -> JobListResponse {
        // Extract jobs array with tolerance for empty bridged arrays
        let jobsArray: [[String: Any]]
        if let typedArray = dict["jobs"] as? [[String: Any]] {
            // Standard case: properly typed array
            jobsArray = typedArray
        } else if let anyArray = dict["jobs"] as? [Any], anyArray.isEmpty {
            // Empty [Any] from bridging - treat as empty job list
            jobsArray = []
        } else if let nsArray = dict["jobs"] as? NSArray, nsArray.count == 0 {
            // Empty NSArray from bridging - treat as empty job list
            jobsArray = []
        } else {
            // Non-empty array that doesn't match expected type, or missing entirely
            throw DecodingError.missingJobsArray
        }

        let jobs: [BackgroundJobListItem]
        if jobsArray.isEmpty {
            jobs = []
        } else {
            let jsonData = try JSONSerialization.data(withJSONObject: jobsArray)
            do {
                jobs = try jobDecoder.decode([BackgroundJobListItem].self, from: jsonData)
            } catch {
                throw DecodingError.decodingFailed(underlying: error)
            }
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
                if jobsArray.isEmpty {
                    return []
                }
                let jsonData = try JSONSerialization.data(withJSONObject: jobsArray)
                return try jobDecoder.decode([BackgroundJob].self, from: jsonData)
            }
            // Tolerance for empty bridged arrays
            if let anyArray = dict["jobs"] as? [Any], anyArray.isEmpty {
                return []
            }
            if let nsArray = dict["jobs"] as? NSArray, nsArray.count == 0 {
                return []
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
            if array.isEmpty {
                return []
            }
            let jsonData = try JSONSerialization.data(withJSONObject: array)
            return try jobDecoder.decode([BackgroundJob].self, from: jsonData)
        }

        // Tolerance for empty bridged arrays (direct format)
        if let anyArray = data as? [Any], anyArray.isEmpty {
            return []
        }
        if let nsArray = data as? NSArray, nsArray.count == 0 {
            return []
        }

        throw DecodingError.invalidJobData
    }

    public static func decodeJobEnvelope(dict: [String: Any]) throws -> BackgroundJob {
        guard let jobData = dict["job"] as? [String: Any] else {
            throw DecodingError.missingJobKey
        }
        return try decodeJob(dict: jobData)
    }

    public static func decodeJobSummary(dict: [String: Any]) throws -> BackgroundJobListItem {
        let jsonData = try JSONSerialization.data(withJSONObject: dict)
        do {
            return try jobDecoder.decode(BackgroundJobListItem.self, from: jsonData)
        } catch {
            throw DecodingError.decodingFailed(underlying: error)
        }
    }

    public static func decodeJobSummaryList(dict: [String: Any]) throws -> JobSummaryListResponse {
        // Extract jobs array with tolerance for empty bridged arrays
        let jobsArray: [[String: Any]]
        if let typedArray = dict["jobs"] as? [[String: Any]] {
            // Standard case: properly typed array
            jobsArray = typedArray
        } else if let anyArray = dict["jobs"] as? [Any], anyArray.isEmpty {
            // Empty [Any] from bridging - treat as empty job list
            jobsArray = []
        } else if let nsArray = dict["jobs"] as? NSArray, nsArray.count == 0 {
            // Empty NSArray from bridging - treat as empty job list
            jobsArray = []
        } else {
            // Non-empty array that doesn't match expected type, or missing entirely
            throw DecodingError.missingJobsArray
        }

        let jobs: [BackgroundJobListItem]
        if jobsArray.isEmpty {
            jobs = []
        } else {
            let jsonData = try JSONSerialization.data(withJSONObject: jobsArray)
            do {
                jobs = try jobDecoder.decode([BackgroundJobListItem].self, from: jsonData)
            } catch {
                throw DecodingError.decodingFailed(underlying: error)
            }
        }

        let totalCount = dict["totalCount"] as? Int ?? jobs.count
        let page = dict["page"] as? Int ?? 0
        let pageSize = dict["pageSize"] as? Int ?? jobs.count
        let hasMore = dict["hasMore"] as? Bool ?? false

        return JobSummaryListResponse(
            jobs: jobs,
            totalCount: UInt32(totalCount),
            page: UInt32(page),
            pageSize: UInt32(pageSize),
            hasMore: hasMore
        )
    }
}
