import SwiftUI
import Core
import Combine

public struct ImplementationPlansView: View {
    @EnvironmentObject private var container: AppContainer
    @State private var selectedPlans: Set<String> = []
    @State private var mergeInstructions = ""
    @State private var isLoading = false
    @State private var isMerging = false
    @State private var errorMessage: String?
    @State private var plans: [PlanSummary] = []
    @State private var currentPlanIndex = 0

    public init() {}

    public var body: some View {
        VStack(spacing: 20) {
            // Header
            AppHeaderBar(
                title: "Plans",
                subtitle: "Manage and merge implementation plans"
            )

                // Loading State
                if isLoading {
                    HStack {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                            .scaleEffect(0.8)
                        Text("Loading plans...")
                            .foregroundColor(Color.mutedForeground)
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
                                    .h4()
                                    .foregroundColor(Color.primary)

                                Spacer()

                                Button("Clear Selection") {
                                    selectedPlans.removeAll()
                                }
                                .small()
                                .foregroundColor(Color.mutedForeground)
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
                                                .h4()
                                                .foregroundColor(Color.cardForeground)

                                            Spacer()

                                            Text("\(sessionPlans.count) plan\(sessionPlans.count == 1 ? "" : "s")")
                                                .small()
                                                .foregroundColor(Color.mutedForeground)
                                                .padding(.horizontal, 8)
                                                .padding(.vertical, 4)
                                                .background(Color.muted.opacity(0.2))
                                                .cornerRadius(4)
                                        }
                                        .padding(.horizontal)

                                        // Plans in this session
                                        ForEach(sessionPlans) { plan in
                                            NavigationLink(destination: PlanDetailView(plan: plan, allPlans: plans, plansService: container.plansService)) {
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
                                        .h4()
                                        .foregroundColor(Color.cardForeground)

                                    TextField("Enter instructions for merging the selected plans...", text: $mergeInstructions, axis: .vertical)
                                        .lineLimit(3...6)
                                        .textFieldStyle(PlainTextFieldStyle())
                                        .padding(12)
                                        .background(Color.card)
                                        .cornerRadius(8)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(Color.border, lineWidth: 1)
                                        )

                                    HStack {
                                        Button("Merge Plans") {
                                            mergePlans()
                                        }
                                        .buttonStyle(PrimaryButtonStyle())
                                        .disabled(mergeInstructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isMerging)

                                        if isMerging {
                                            ProgressView()
                                                .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                                                .scaleEffect(0.8)
                                        }

                                        Spacer()
                                    }
                                }
                                .padding()
                                .background(Color.card.opacity(0.5))
                                .cornerRadius(12)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(Color.primary.opacity(0.3), lineWidth: 1)
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
                            .foregroundColor(Color.mutedForeground)

                        VStack(spacing: 8) {
                            Text("No Implementation Plans")
                                .h4()
                                .foregroundColor(Color.cardForeground)

                            Text("Implementation plans will appear here once you create some tasks.")
                                .paragraph()
                                .foregroundColor(Color.mutedForeground)
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
        .refreshable {
            await refreshPlans()
        }
        .onAppear {
            loadPlans()
            setupRealTimeUpdates()
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

        container.plansService.listPlans(request: request)
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

            container.plansService.listPlans(request: request)
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

    private func setupRealTimeUpdates() {
        container.plansService.$lastUpdateEvent
            .compactMap { $0 }
            .sink { event in
                DispatchQueue.main.async {
                    handleRealTimeUpdate(event: event)
                }
            }
            .store(in: &cancellables)

        container.plansService.$plans
            .receive(on: DispatchQueue.main)
            .sink { updatedPlans in
                plans = updatedPlans
            }
            .store(in: &cancellables)
    }

    private func handleRealTimeUpdate(event: RelayEvent) {
        switch event.eventType {
        case "PlansUpdated", "PlanCreated", "PlanDeleted", "PlanModified":
            loadPlans()
        default:
            break
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
                        .foregroundColor(isSelected ? Color.primary : Color.mutedForeground)
                }
                .buttonStyle(PlainButtonStyle())

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(plan.title ?? "Untitled Plan")
                            .h4()
                            .foregroundColor(Color.cardForeground)
                            .lineLimit(2)

                        Spacer()

                        // Status badge
                        StatusBadge(status: plan.status)
                    }

                    HStack {
                        Text(plan.formattedDate)
                            .small()
                            .foregroundColor(Color.mutedForeground)

                        Spacer()

                        Text(plan.size)
                            .small()
                            .foregroundColor(Color.mutedForeground)
                    }

                    if let filePath = plan.filePath {
                        Text(filePath)
                            .small()
                            .foregroundColor(Color.mutedForeground)
                            .lineLimit(1)
                    }
                }

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(Color.mutedForeground)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color.primary.opacity(0.1) : Color.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                isSelected ? Color.primary : Color.border,
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
            .small()
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(statusColor.opacity(0.2))
            .foregroundColor(statusColor)
            .cornerRadius(4)
    }

    private var statusColor: Color {
        switch status.lowercased() {
        case "completed":
            return Color.success
        case "running", "processing":
            return Color.primary
        case "failed", "error":
            return Color.destructive
        case "pending", "queued":
            return Color.warning
        default:
            return Color.muted
        }
    }
}

#Preview {
    ImplementationPlansView()
}