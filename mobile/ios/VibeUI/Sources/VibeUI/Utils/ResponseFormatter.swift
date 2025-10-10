import SwiftUI
import Core

struct ResponseFormatter {
    static func formattedView(
        for job: BackgroundJob,
        onUseFiles: (([String]) -> Void)? = nil,
        onUseResearch: (([[String: Any]]) -> Void)? = nil,
        onUseFindings: (([String: Any]) -> Void)? = nil
    ) -> AnyView? {
        guard let responseStr = job.response else { return nil }

        // Parse response (may be JSON or plain text)
        let responseData: [String: Any]?
        if let data = responseStr.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            responseData = json
        } else {
            responseData = nil
        }

        switch job.taskType {
        case "video_analysis":
            return formatVideoAnalysis(job, responseData, responseStr, onUseFindings)

        case "root_folder_selection":
            return formatRootFolderSelection(responseData)

        case "regex_file_filter", "file_relevance_assessment", "extended_path_finder", "path_correction":
            return formatFileFinderTask(job, responseData, onUseFiles)

        case "web_search_prompts_generation":
            return formatWebSearchPrompts(responseData)

        case "web_search_execution":
            return formatWebSearchExecution(job, responseData, onUseResearch)

        case "task_refinement":
            return formatTaskRefinement(responseData)

        default:
            return nil
        }
    }

    private static func formatVideoAnalysis(
        _ job: BackgroundJob,
        _ data: [String: Any]?,
        _ raw: String,
        _ onUseFindings: (([String: Any]) -> Void)?
    ) -> AnyView {
        let analysis = data?["analysis"] as? String ?? raw
        return AnyView(
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Video Analysis")
                        .font(.headline)
                    Text(analysis)
                        .font(.body)
                        .textSelection(.enabled)

                    if job.status == "completed", let onUseFindings = onUseFindings, let data = data {
                        Button(action: { onUseFindings(data) }) {
                            Label("Use Findings", systemImage: "video")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .padding(.top, 8)
                    }
                }
                .padding()
            }
        )
    }

    private static func formatRootFolderSelection(_ data: [String: Any]?) -> AnyView {
        let directories = data?["root_directories"] as? [String] ?? []
        return AnyView(
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Root Directories (\(directories.count))")
                        .font(.headline)
                    ForEach(directories, id: \.self) { dir in
                        Text(dir)
                            .font(.system(.body, design: .monospaced))
                            .textSelection(.enabled)
                    }
                }
                .padding()
            }
        )
    }

    private static func formatFileFinderTask(
        _ job: BackgroundJob,
        _ data: [String: Any]?,
        _ onUseFiles: (([String]) -> Void)?
    ) -> AnyView {
        let summary = data?["summary"] as? String
        let files = data?["files"] as? [String] ?? []
        let isEmpty = data?["isEmptyResult"] as? Bool ?? false

        return AnyView(
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(job.taskType.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.headline)

                    if let summary = summary {
                        Text(summary)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }

                    if isEmpty {
                        Text("No files found matching criteria")
                            .font(.body)
                            .foregroundColor(.secondary)
                            .italic()
                    } else {
                        Text("\(files.count) files found")
                            .font(.subheadline)
                            .fontWeight(.medium)

                        ForEach(files, id: \.self) { file in
                            Text(file)
                                .font(.system(.caption, design: .monospaced))
                                .textSelection(.enabled)
                        }

                        if job.status == "completed" && !files.isEmpty, let onUseFiles = onUseFiles {
                            Button(action: { onUseFiles(files) }) {
                                Label("Use Files", systemImage: "doc.on.doc")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .padding(.top, 8)
                        }
                    }
                }
                .padding()
            }
        )
    }

    private static func formatWebSearchPrompts(_ data: [String: Any]?) -> AnyView {
        let prompts = data?["prompts"] as? [String] ?? []
        let queries = data?["queries"] as? [String] ?? []

        return AnyView(
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Generated Search Prompts (\(prompts.count))")
                        .font(.headline)

                    if !queries.isEmpty {
                        Text("Queries:")
                            .font(.subheadline)
                            .fontWeight(.medium)
                        ForEach(queries, id: \.self) { query in
                            Text("• \(query)")
                                .font(.body)
                        }
                    }

                    Text("Prompts:")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .padding(.top, 8)

                    ForEach(Array(prompts.enumerated()), id: \.offset) { index, prompt in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Prompt \(index + 1)")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(prompt)
                                .font(.body)
                                .textSelection(.enabled)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .padding()
            }
        )
    }

    private static func formatWebSearchExecution(
        _ job: BackgroundJob,
        _ data: [String: Any]?,
        _ onUseResearch: (([[String: Any]]) -> Void)?
    ) -> AnyView {
        let summary = data?["summary"] as? String
        let results = data?["searchResults"] as? [[String: Any]] ?? []

        return AnyView(
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Research Findings (\(results.count))")
                        .font(.headline)

                    if let summary = summary {
                        Text(summary)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .padding(.bottom, 8)
                    }

                    ForEach(Array(results.enumerated()), id: \.offset) { index, result in
                        VStack(alignment: .leading, spacing: 4) {
                            if let title = result["title"] as? String {
                                Text(title)
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                            }
                            if let findings = result["findings"] as? String {
                                Text(findings)
                                    .font(.body)
                                    .textSelection(.enabled)
                            }
                        }
                        .padding(.vertical, 8)
                        Divider()
                    }

                    if job.status == "completed" && !results.isEmpty, let onUseResearch = onUseResearch {
                        Button(action: { onUseResearch(results) }) {
                            Label("Use Research", systemImage: "book")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .padding(.top, 8)
                    }
                }
                .padding()
            }
        )
    }

    private static func formatTaskRefinement(_ data: [String: Any]?) -> AnyView {
        let refinedTask = data?["refinedTask"] as? String ?? ""
        let analysis = data?["analysis"] as? String

        return AnyView(
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Refined Task")
                        .font(.headline)

                    Text(refinedTask)
                        .font(.body)
                        .textSelection(.enabled)
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(Theme.Radii.base)

                    if let analysis = analysis {
                        Text("Analysis")
                            .font(.headline)
                            .padding(.top, 8)
                        Text(analysis)
                            .font(.body)
                            .foregroundColor(.secondary)
                            .textSelection(.enabled)
                    }
                }
                .padding()
            }
        )
    }
}
