import SwiftUI
import Core
import Combine

public struct PlanDetailView: View {
    let plan: PlanSummary
    let allPlans: [PlanSummary]
    @StateObject private var plansService = DataServicesManager(baseURL: URL(string: Config.serverURL)!, deviceId: DeviceManager.shared.getOrCreateDeviceID()).plansService
    @State private var content: String = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var currentIndex: Int
    @State private var showingTerminal = false

    public init(plan: PlanSummary, allPlans: [PlanSummary]) {
        self.plan = plan
        self.allPlans = allPlans
        // Find the index of the current plan
        let index = allPlans.firstIndex { $0.jobId == plan.jobId } ?? 0
        self._currentIndex = State(initialValue: index)
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Navigation toolbar with Previous/Next arrows
            navigationToolbar()

            // Content area
            if isLoading {
                loadingView()
            } else if let errorMessage = errorMessage {
                errorView(message: errorMessage)
            } else {
                contentView()
            }
        }
        .navigationTitle("Plan Details")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingTerminal) {
            RemoteTerminalView(jobId: currentPlan.jobId)
        }
        .onAppear {
            loadPlanContent()
        }
    }

    @ViewBuilder
    private func navigationToolbar() -> some View {
        HStack {
            // Previous button
            Button(action: previousPlan) {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.caption)
                    Text("Previous")
                        .font(.caption)
                }
                .foregroundColor(canGoPrevious ? Color("Primary") : Color("MutedForeground"))
            }
            .disabled(!canGoPrevious)

            Spacer()

            // Plan counter
            Text("Plan \(currentIndex + 1) of \(allPlans.count)")
                .font(.caption)
                .foregroundColor(Color("MutedForeground"))

            Spacer()

            // Next button
            Button(action: nextPlan) {
                HStack(spacing: 4) {
                    Text("Next")
                        .font(.caption)
                    Image(systemName: "chevron.right")
                        .font(.caption)
                }
                .foregroundColor(canGoNext ? Color("Primary") : Color("MutedForeground"))
            }
            .disabled(!canGoNext)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color("Card"))
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color("Border")),
            alignment: .bottom
        )
    }

    @ViewBuilder
    private func loadingView() -> some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: Color("Primary")))
                .scaleEffect(1.2)

            Text("Loading plan content...")
                .font(.body)
                .foregroundColor(Color("MutedForeground"))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color("Background"))
    }

    @ViewBuilder
    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(Color("Destructive"))

            Text("Error Loading Plan")
                .font(.headline)
                .foregroundColor(Color("CardForeground"))

            Text(message)
                .font(.body)
                .foregroundColor(Color("MutedForeground"))
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button("Retry") {
                loadPlanContent()
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color("Background"))
    }

    @ViewBuilder
    private func contentView() -> some View {
        VStack(spacing: 0) {
            // Plan header info
            planHeaderInfo()

            // Code editor with content
            CodeEditor(text: .constant(content), language: .xml)
                .background(Color("Card"))
        }
    }

    @ViewBuilder
    private func planHeaderInfo() -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title = currentPlan.title {
                Text(title)
                    .font(.headline)
                    .foregroundColor(Color("CardForeground"))
                    .lineLimit(2)
            }

            HStack {
                if let filePath = currentPlan.filePath {
                    Text(filePath)
                        .font(.caption)
                        .foregroundColor(Color("MutedForeground"))
                        .lineLimit(1)
                }

                Spacer()

                StatusBadge(status: currentPlan.status)
            }

            HStack {
                Text(currentPlan.formattedDate)
                    .font(.caption2)
                    .foregroundColor(Color("MutedForeground"))

                Spacer()

                Text(currentPlan.size)
                    .font(.caption2)
                    .foregroundColor(Color("MutedForeground"))
            }
        }
        .padding()
        .background(Color("Card"))
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color("Border")),
            alignment: .bottom
        )
    }

    // MARK: - Computed Properties

    private var currentPlan: PlanSummary {
        return allPlans[safe: currentIndex] ?? plan
    }

    private var canGoPrevious: Bool {
        return currentIndex > 0
    }

    private var canGoNext: Bool {
        return currentIndex < allPlans.count - 1
    }

    // MARK: - Navigation Methods

    private func previousPlan() {
        guard canGoPrevious else { return }
        currentIndex -= 1
        loadPlanContent()
    }

    private func nextPlan() {
        guard canGoNext else { return }
        currentIndex += 1
        loadPlanContent()
    }

    // MARK: - Data Loading

    private func loadPlanContent() {
        let planToLoad = currentPlan

        isLoading = true
        errorMessage = nil
        content = ""

        plansService.getFullPlanContent(jobId: planToLoad.jobId)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    isLoading = false
                    if case .failure(let error) = completion {
                        errorMessage = error.localizedDescription
                    }
                },
                receiveValue: { planContent in
                    content = planContent
                    isLoading = false
                }
            )
            .store(in: &cancellables)
    }

    @State private var cancellables = Set<AnyCancellable>()
}

// MARK: - Supporting Views

private struct StatusBadge: View {
    let status: String

    var body: some View {
        Text(status.capitalized)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(statusColor.opacity(0.2))
            .foregroundColor(statusColor)
            .cornerRadius(4)
    }

    private var statusColor: Color {
        switch status.lowercased() {
        case "completed":
            return .green
        case "running", "processing":
            return .blue
        case "failed", "error":
            return .red
        case "pending", "queued":
            return .orange
        default:
            return .gray
        }
    }
}

private struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(Color("Primary"))
            .foregroundColor(.white)
            .cornerRadius(8)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Extensions

extension Array {
    subscript(safe index: Int) -> Element? {
        return indices.contains(index) ? self[index] : nil
    }
}

#Preview {
    // Create mock data via JSON decoding
    let planJSON = """
    {
        "id": "1",
        "jobId": "job-1",
        "title": "Sample Implementation Plan",
        "filePath": "/path/to/file.swift",
        "createdAt": \(Int64(Date().timeIntervalSince1970)),
        "sizeBytes": 1024,
        "status": "completed",
        "sessionId": "session-1"
    }
    """

    let samplePlan = try! JSONDecoder().decode(PlanSummary.self, from: planJSON.data(using: .utf8)!)

    let allPlans = [samplePlan]

    PlanDetailView(plan: samplePlan, allPlans: allPlans)
}