import SwiftUI
import Core
import Combine

public struct ImplementationPlansView: View {
    @StateObject private var plansService = DataServicesManager(baseURL: URL(string: Config.serverURL)!, deviceId: DeviceManager.shared.getOrCreateDeviceID()).plansService
    @State private var selectedPlans: Set<String> = []
    @State private var mergeInstructions = ""
    @State private var isLoading = false
    @State private var isMerging = false
    @State private var errorMessage: String?
    @State private var plans: [PlanSummary] = []
    @State private var currentPlanIndex = 0

    public init() {}

    public var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                // Header with navigation
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Implementation Plans")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundColor(Color("CardForeground"))

                        Spacer()

                        // Plan count and navigation
                        if !plans.isEmpty {
                            HStack(spacing: 16) {
                                Text("\(currentPlanIndex + 1) of \(plans.count)")
                                    .font(.caption)
                                    .foregroundColor(Color("MutedForeground"))

                                HStack(spacing: 8) {
                                    Button(action: previousPlan) {
                                        Image(systemName: "chevron.left")
                                            .font(.title2)
                                            .foregroundColor(currentPlanIndex > 0 ? Color("Primary") : Color("MutedForeground"))
                                    }
                                    .disabled(currentPlanIndex <= 0)

                                    Button(action: nextPlan) {
                                        Image(systemName: "chevron.right")
                                            .font(.title2)
                                            .foregroundColor(currentPlanIndex < plans.count - 1 ? Color("Primary") : Color("MutedForeground"))
                                    }
                                    .disabled(currentPlanIndex >= plans.count - 1)
                                }
                            }
                        }
                    }

                    Text("Manage and merge implementation plans")
                        .font(.body)
                        .foregroundColor(Color("MutedForeground"))
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                // Loading State
                if isLoading {
                    HStack {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Color("Primary")))
                            .scaleEffect(0.8)
                        Text("Loading plans...")
                            .foregroundColor(Color("MutedForeground"))
                    }
                    .padding()
                }

                // Error Message
                if let errorMessage = errorMessage {
                    StatusAlertView(variant: .destructive, title: "Error", message: errorMessage)
                }

                // Plans List
                if !plans.isEmpty {
                    VStack(spacing: 16) {
                        // Selection Summary
                        if !selectedPlans.isEmpty {
                            HStack {
                                Text("\(selectedPlans.count) plan\(selectedPlans.count == 1 ? "" : "s") selected")
                                    .font(.headline)
                                    .foregroundColor(Color("Primary"))

                                Spacer()

                                Button("Clear Selection") {
                                    selectedPlans.removeAll()
                                }
                                .font(.caption)
                                .foregroundColor(Color("MutedForeground"))
                            }
                            .padding(.horizontal)
                        }

                        ScrollView {
                            LazyVStack(spacing: 16) {
                                // Show grouped plans by task/session
                                ForEach(Array(groupedPlans.keys.sorted()), id: \.self) { sessionId in
                                    let sessionPlans = groupedPlans[sessionId] ?? []

                                    VStack(alignment: .leading, spacing: 12) {
                                        // Session header with plan count
                                        HStack {
                                            Text("Task Group")
                                                .font(.headline)
                                                .foregroundColor(Color("CardForeground"))

                                            Spacer()

                                            Text("\(sessionPlans.count) plan\(sessionPlans.count == 1 ? "" : "s")")
                                                .font(.caption)
                                                .foregroundColor(Color("MutedForeground"))
                                                .padding(.horizontal, 8)
                                                .padding(.vertical, 4)
                                                .background(Color("Muted").opacity(0.2))
                                                .cornerRadius(4)
                                        }
                                        .padding(.horizontal)

                                        // Plans in this session
                                        ForEach(sessionPlans) { plan in
                                            NavigationLink(destination: PlanDetailView(plan: plan, allPlans: plans)) {
                                                PlanCard(
                                                    plan: plan,
                                                    isSelected: selectedPlans.contains(plan.jobId),
                                                    onSelectionChanged: { isSelected in
                                                        if isSelected {
                                                            selectedPlans.insert(plan.jobId)
                                                        } else {
                                                            selectedPlans.remove(plan.jobId)
                                                        }
                                                    },
                                                    onTap: {
                                                        // Navigation is handled by NavigationLink
                                                    }
                                                )
                                            }
                                            .buttonStyle(PlainButtonStyle())
                                            .padding(.horizontal)
                                        }
                                    }
                                }
                            }
                            .padding(.vertical)
                        }

                        // Merge Section
                        if selectedPlans.count > 1 {
                            VStack(spacing: 16) {
                                Divider()

                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Merge Instructions")
                                        .font(.headline)
                                        .foregroundColor(Color("CardForeground"))

                                    TextField("Enter instructions for merging the selected plans...", text: $mergeInstructions, axis: .vertical)
                                        .lineLimit(3...6)
                                        .textFieldStyle(PlainTextFieldStyle())
                                        .padding(12)
                                        .background(Color("Card"))
                                        .cornerRadius(8)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(Color("Border"), lineWidth: 1)
                                        )

                                    HStack {
                                        Button("Merge Plans") {
                                            mergePlans()
                                        }
                                        .buttonStyle(PrimaryButtonStyle())
                                        .disabled(mergeInstructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isMerging)

                                        if isMerging {
                                            ProgressView()
                                                .progressViewStyle(CircularProgressViewStyle(tint: Color("Primary")))
                                                .scaleEffect(0.8)
                                        }

                                        Spacer()
                                    }
                                }
                                .padding()
                                .background(Color("Card").opacity(0.5))
                                .cornerRadius(12)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(Color("Primary").opacity(0.3), lineWidth: 1)
                                )
                            }
                            .padding(.horizontal)
                        }
                    }
                }

                // Empty State
                if plans.isEmpty && !isLoading {
                    VStack(spacing: 16) {
                        Image(systemName: "doc.text")
                            .font(.system(size: 48))
                            .foregroundColor(Color("MutedForeground"))

                        VStack(spacing: 8) {
                            Text("No Implementation Plans")
                                .font(.headline)
                                .foregroundColor(Color("CardForeground"))

                            Text("Implementation plans will appear here once you create some tasks.")
                                .font(.body)
                                .foregroundColor(Color("MutedForeground"))
                                .multilineTextAlignment(.center)
                        }

                        Button("Refresh") {
                            loadPlans()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding()
                }

                Spacer()
            }
            .padding()
        }
        .navigationTitle("Plans")
        .refreshable {
            await refreshPlans()
        }
        .onAppear {
            loadPlans()
        }
    }

    private func loadPlans() {
        isLoading = true
        errorMessage = nil

        let request = PlanListRequest(
            projectDirectory: nil,
            page: 0,
            pageSize: 50,
            sortBy: .createdAt,
            sortOrder: .desc,
            includeMetadataOnly: true
        )

        plansService.listPlans(request: request)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    isLoading = false
                    if case .failure(let error) = completion {
                        errorMessage = error.localizedDescription
                    }
                },
                receiveValue: { response in
                    plans = response.plans
                    isLoading = false
                }
            )
            .store(in: &cancellables)
    }

    private func refreshPlans() async {
        await withCheckedContinuation { continuation in
            let request = PlanListRequest(
                projectDirectory: nil,
                page: 0,
                pageSize: 50,
                sortBy: .createdAt,
                sortOrder: .desc,
                includeMetadataOnly: true
            )

            plansService.listPlans(request: request)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        if case .failure(let error) = completion {
                            errorMessage = error.localizedDescription
                        }
                        continuation.resume()
                    },
                    receiveValue: { response in
                        plans = response.plans
                        continuation.resume()
                    }
                )
                .store(in: &cancellables)
        }
    }

    private func mergePlans() {
        guard selectedPlans.count > 1,
              !mergeInstructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }

        Task {
            await executeMergePlans()
        }
    }

    private func executeMergePlans() async {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            await MainActor.run {
                errorMessage = "No active device connection"
            }
            return
        }

        await MainActor.run {
            isMerging = true
            errorMessage = nil
        }

        let request = RpcRequest(
            method: "actions.mergePlans",
            params: [
                "sessionId": AnyCodable("mobile-session"), // TODO: Get actual session ID
                "sourceJobIds": AnyCodable(Array(selectedPlans)),
                "mergeInstructions": AnyCodable(mergeInstructions.trimmingCharacters(in: .whitespacesAndNewlines))
            ]
        )

        do {
            var mergeResult: [String: Any]?

            for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                if let error = response.error {
                    await MainActor.run {
                        errorMessage = "Merge error: \(error.message)"
                        isMerging = false
                    }
                    return
                }

                if let result = response.result?.value as? [String: Any] {
                    mergeResult = result
                    if response.isFinal {
                        break
                    }
                }
            }

            await MainActor.run {
                isMerging = false
                if let result = mergeResult {
                    // Handle successful merge
                    if let newJobId = result["jobId"] as? String {
                        // Clear selection and instructions
                        selectedPlans.removeAll()
                        mergeInstructions = ""

                        // Refresh plans to show the new merged plan
                        loadPlans()
                    }
                }
            }

        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
                isMerging = false
            }
        }
    }

    @State private var cancellables = Set<AnyCancellable>()

    private func previousPlan() {
        if currentPlanIndex > 0 {
            currentPlanIndex -= 1
        }
    }

    private func nextPlan() {
        if currentPlanIndex < plans.count - 1 {
            currentPlanIndex += 1
        }
    }

    private var groupedPlans: [String: [PlanSummary]] {
        Dictionary(grouping: plans) { plan in
            plan.sessionId
        }
    }
}

private struct PlanCard: View {
    let plan: PlanSummary
    let isSelected: Bool
    let onSelectionChanged: (Bool) -> Void
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 16) {
                // Selection checkbox
                Button(action: {
                    onSelectionChanged(!isSelected)
                }) {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundColor(isSelected ? Color("Primary") : Color("MutedForeground"))
                }
                .buttonStyle(PlainButtonStyle())

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(plan.title ?? "Untitled Plan")
                            .font(.headline)
                            .foregroundColor(Color("CardForeground"))
                            .lineLimit(2)

                        Spacer()

                        // Status badge
                        StatusBadge(status: plan.status)
                    }

                    HStack {
                        Text(plan.formattedDate)
                            .font(.caption)
                            .foregroundColor(Color("MutedForeground"))

                        Spacer()

                        Text(plan.size)
                            .font(.caption)
                            .foregroundColor(Color("MutedForeground"))
                    }

                    if let filePath = plan.filePath {
                        Text(filePath)
                            .font(.caption2)
                            .foregroundColor(Color("MutedForeground"))
                            .lineLimit(1)
                    }
                }

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(Color("MutedForeground"))
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color("Primary").opacity(0.1) : Color("Card"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                isSelected ? Color("Primary") : Color("Border"),
                                lineWidth: isSelected ? 2 : 1
                            )
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

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

private struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color("Secondary"))
            .foregroundColor(Color("SecondaryForeground"))
            .cornerRadius(6)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

#Preview {
    ImplementationPlansView()
}