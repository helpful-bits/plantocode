import SwiftUI
import Core
import Combine

/// Enhanced Plan Detail View with "Use" buttons for copying plan content
public struct PlanDetailView: View {
    let plan: PlanSummary
    let allPlans: [PlanSummary]
    let plansService: PlansDataService

    @State private var content: String = ""
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var saveMessage: String?
    @State private var currentIndex: Int
    @State private var showingTerminal = false
    @State private var showingShareSheet = false
    @State private var shareContent: String = ""
    @State private var selectedStepNumber: String?
    @State private var showingStepSelector = false
    @State private var copiedButtonId: String?

    @StateObject private var copyButtonManager = CopyButtonManager.shared
    @State private var cancellables = Set<AnyCancellable>()

    public init(plan: PlanSummary, allPlans: [PlanSummary], plansService: PlansDataService) {
        self.plan = plan
        self.allPlans = allPlans
        self.plansService = plansService
        let index = allPlans.firstIndex { $0.jobId == plan.jobId } ?? 0
        self._currentIndex = State(initialValue: index)
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Header with breadcrumb
            AppHeaderBar(
                title: currentPlan.title ?? "Plan Details",
                breadcrumb: ["Plans", currentPlan.title ?? "Untitled"],
                actions: AnyView(
                    HStack(spacing: 16) {
                        Button(action: previousPlan) {
                            Image(systemName: "chevron.left")
                                .font(.title3)
                        }
                        .foregroundColor(canGoPrevious ? Color.primary : Color.mutedForeground)
                        .disabled(!canGoPrevious)

                        Button(action: nextPlan) {
                            Image(systemName: "chevron.right")
                                .font(.title3)
                        }
                        .foregroundColor(canGoNext ? Color.primary : Color.mutedForeground)
                        .disabled(!canGoNext)
                    }
                )
            )

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
        .sheet(isPresented: $showingShareSheet) {
            ShareSheet(activityItems: [shareContent])
        }
        .sheet(isPresented: $showingStepSelector) {
            StepSelectorSheet(
                steps: parsedSteps,
                selectedStep: $selectedStepNumber,
                onSelect: { step in
                    selectedStepNumber = step
                    showingStepSelector = false
                }
            )
        }
        .onAppear {
            loadPlanContent()
        }
    }

    // MARK: - Loading & Error Views

    @ViewBuilder
    private func loadingView() -> some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                .scaleEffect(1.2)

            Text("Loading plan content...")
                .paragraph()
                .foregroundColor(Color.mutedForeground)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.background)
    }

    @ViewBuilder
    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(Color.destructive)

            Text("Error Loading Plan")
                .h4()
                .foregroundColor(Color.cardForeground)

            Text(message)
                .paragraph()
                .foregroundColor(Color.mutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button("Retry") {
                loadPlanContent()
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.background)
    }

    // MARK: - Content View

    @ViewBuilder
    private func contentView() -> some View {
        VStack(spacing: 0) {
            // Plan header info
            planHeaderInfo()

            // Use Buttons Section (Mobile-optimized)
            useButtonsSection()

            // Code editor with content
            VStack(spacing: 0) {
                // Editor toolbar
                HStack {
                    Text("Plan Content")
                        .h4()
                        .foregroundColor(Color.cardForeground)

                    Spacer()

                    if isSaving {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                            .scaleEffect(0.8)
                    }

                    Button("Save") {
                        savePlan()
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isSaving)
                }
                .padding()
                .background(Color.card)
                .overlay(
                    Rectangle()
                        .frame(height: 1)
                        .foregroundColor(Color.border),
                    alignment: .bottom
                )

                // Save/Error messages
                if let saveMessage = saveMessage {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(Color.success)
                        Text(saveMessage)
                            .small()
                            .foregroundColor(Color.success)
                        Spacer()
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                    .background(Color.success.opacity(0.1))
                }

                // Code editor
                CodeEditor(text: $content, language: .markdown)
                    .background(Color.card)
            }
        }
    }

    // MARK: - Use Buttons Section

    @ViewBuilder
    private func useButtonsSection() -> some View {
        VStack(spacing: 12) {
            // Section header
            HStack {
                Image(systemName: "square.and.arrow.up")
                    .font(.caption)
                    .foregroundColor(Color.primary)
                Text("Quick Actions")
                    .h4()
                    .foregroundColor(Color.cardForeground)

                Spacer()

                // Step selector button
                if !parsedSteps.isEmpty {
                    Button(action: { showingStepSelector = true }) {
                        HStack(spacing: 4) {
                            if let stepNum = selectedStepNumber {
                                Text("Step \(stepNum)")
                                    .small()
                            } else {
                                Text("All Steps")
                                    .small()
                            }
                            Image(systemName: "chevron.down")
                                .small()
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.secondary)
                        .foregroundColor(Color.secondaryForeground)
                        .cornerRadius(4)
                    }
                }
            }

            // Copy buttons grid (2 columns for mobile)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(copyButtonManager.buttons) { button in
                    UseButton(
                        button: button,
                        isCopied: copiedButtonId == button.id,
                        onTap: {
                            handleCopyButtonClick(button)
                        }
                    )
                }
            }
        }
        .padding()
        .background(Color.card)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.border),
            alignment: .bottom
        )
    }

    // MARK: - Plan Header

    @ViewBuilder
    private func planHeaderInfo() -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title = currentPlan.title {
                Text(title)
                    .h4()
                    .foregroundColor(Color.cardForeground)
                    .lineLimit(2)
            }

            HStack {
                if let filePath = currentPlan.filePath {
                    Text(filePath)
                        .small()
                        .foregroundColor(Color.mutedForeground)
                        .lineLimit(1)
                }

                Spacer()

                StatusBadge(status: currentPlan.status)
            }

            HStack {
                Text(currentPlan.formattedDate)
                    .small()
                    .foregroundColor(Color.mutedForeground)

                Spacer()

                Text(currentPlan.size)
                    .small()
                    .foregroundColor(Color.mutedForeground)
            }
        }
        .padding()
        .background(Color.card)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.border),
            alignment: .bottom
        )
    }

    // MARK: - Computed Properties

    private var currentPlan: PlanSummary {
        guard currentIndex >= 0 && currentIndex < allPlans.count else {
            return plan
        }
        return allPlans[currentIndex]
    }

    private var canGoPrevious: Bool {
        return currentIndex > 0
    }

    private var canGoNext: Bool {
        return currentIndex < allPlans.count - 1
    }

    private var parsedSteps: [PlanContentParser.ParsedStep] {
        guard !content.isEmpty else { return [] }
        return PlanContentParser.extractSteps(from: content)
    }

    // MARK: - Button Handlers

    private func handleCopyButtonClick(_ button: CopyButton) {
        let processedContent = button.processContent(
            planContent: content,
            stepNumber: selectedStepNumber
        )

        // Copy to clipboard
        UIPasteboard.general.string = processedContent

        // Show feedback
        copiedButtonId = button.id

        // Haptic feedback
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)

        // Reset copied state after 2 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            copiedButtonId = nil
        }

        // Also trigger share sheet for iOS sharing
        shareContent = processedContent
        showingShareSheet = true
    }

    // MARK: - Navigation Methods

    private func previousPlan() {
        guard canGoPrevious else { return }
        currentIndex -= 1
        selectedStepNumber = nil
        loadPlanContent()
    }

    private func nextPlan() {
        guard canGoNext else { return }
        currentIndex += 1
        selectedStepNumber = nil
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
                    self.isLoading = false
                    if case .failure(let error) = completion {
                        self.errorMessage = error.localizedDescription
                    }
                },
                receiveValue: { planContent in
                    self.content = planContent
                    self.isLoading = false
                }
            )
            .store(in: &cancellables)
    }

    private func savePlan() {
        let planToSave = currentPlan

        isSaving = true
        errorMessage = nil
        saveMessage = nil

        Task {
            do {
                for try await result in plansService.savePlan(id: planToSave.jobId, content: content) {
                    await MainActor.run {
                        if let resultDict = result as? [String: Any],
                           let success = resultDict["success"] as? Bool, success {
                            saveMessage = "Plan saved successfully"
                            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                                saveMessage = nil
                            }
                        }
                    }
                }

                await MainActor.run {
                    isSaving = false
                }

            } catch {
                await MainActor.run {
                    isSaving = false
                    errorMessage = "Save failed: \(error.localizedDescription)"
                }
            }
        }
    }
}

// MARK: - Use Button Component

struct UseButton: View {
    let button: CopyButton
    let isCopied: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Image(systemName: isCopied ? "checkmark" : "doc.on.doc")
                    .font(.caption)
                    .foregroundColor(isCopied ? Color.success : Color.primary)

                Text(button.label)
                    .small()
                    .foregroundColor(isCopied ? Color.success : Color.cardForeground)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .padding(.horizontal, 8)
            .background(
                isCopied ?
                Color.success.opacity(0.1) :
                Color.secondary.opacity(0.5)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(
                        isCopied ? Color.success : Color.border,
                        lineWidth: 1
                    )
            )
            .cornerRadius(8)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Step Selector Sheet

struct StepSelectorSheet: View {
    let steps: [PlanContentParser.ParsedStep]
    @Binding var selectedStep: String?
    let onSelect: (String?) -> Void
    @Environment(\.presentationMode) var presentationMode

    var body: some View {
        NavigationView {
            List {
                // All steps option
                Button(action: {
                    onSelect(nil)
                    presentationMode.wrappedValue.dismiss()
                }) {
                    HStack {
                        Text("All Steps")
                            .foregroundColor(Color.cardForeground)
                        Spacer()
                        if selectedStep == nil {
                            Image(systemName: "checkmark")
                                .foregroundColor(Color.primary)
                        }
                    }
                }

                // Individual steps
                ForEach(steps, id: \.number) { step in
                    Button(action: {
                        onSelect(step.number)
                        presentationMode.wrappedValue.dismiss()
                    }) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Step \(step.number)")
                                    .small()
                                    .foregroundColor(Color.mutedForeground)
                                Text(step.title)
                                    .paragraph()
                                    .foregroundColor(Color.cardForeground)
                            }
                            Spacer()
                            if selectedStep == step.number {
                                Image(systemName: "checkmark")
                                    .foregroundColor(Color.primary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Select Step")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        presentationMode.wrappedValue.dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Share Sheet

struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(
            activityItems: activityItems,
            applicationActivities: nil
        )
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Supporting Views

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

    guard let jsonData = planJSON.data(using: .utf8),
          let samplePlan = try? JSONDecoder().decode(PlanSummary.self, from: jsonData),
          let serverURL = URL(string: Config.serverURL) else {
        return Text("Preview data unavailable")
    }

    let allPlans = [samplePlan]
    let plansService = DataServicesManager(baseURL: serverURL, deviceId: DeviceManager.shared.getOrCreateDeviceID()).plansService

    return PlanDetailView(plan: samplePlan, allPlans: allPlans, plansService: plansService)
}