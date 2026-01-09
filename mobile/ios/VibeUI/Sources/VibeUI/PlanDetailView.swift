import SwiftUI
import Core
import Combine
import MarkdownUI

private func dynamicColor(_ pair: Theme.DynamicColorPair) -> Color {
    Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark ? UIColor(pair.dark) : UIColor(pair.light)
    })
}

/// Simplified plan viewer for mobile - maximum reading space
public struct PlanDetailView: View {
    let jobId: String
    let allPlanJobIds: [String]
    @EnvironmentObject private var container: AppContainer
    @Environment(\.dismiss) private var dismiss

    @State private var xmlContent: String = ""
    @State private var markdownContent: String = ""
    @State private var parsedMarkdown: MarkdownContent?
    @State private var isConvertingToMarkdown: Bool = false
    @State private var showingMarkdown: Bool = true
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var currentIndex: Int
    @State private var showingTerminal = false
    @State private var hasUnsavedChanges = false
    @State private var showingSaveConfirmation = false
    @State private var isEditMode = false
    @State private var isLoadingContent = false
    @State private var hasInitializedContent = false

    @State private var cancellables = Set<AnyCancellable>()
    @FocusState private var isEditorFocused: Bool
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var isLandscape: Bool {
        return verticalSizeClass == .compact
    }

    private var jobsService: JobsDataService {
        return container.jobsService
    }

    private var observedJob: BackgroundJob? {
        container.jobsService.jobs.first(where: { $0.id == currentJobId })
    }

    private var isStreaming: Bool {
        let status = observedJob?.status.lowercased() ?? ""
        let streamingStatuses: Set<String> = ["running", "processingstream", "generatingstream"]

        if streamingStatuses.contains(status) {
            return true
        }

        // Fallback to metadata check
        if PlanContentParser.isTaskStreaming(from: observedJob?.metadata) {
            return true
        }

        return false
    }

    private var markdownConversionStatus: String? {
        // Prefer the summary field (available without metadata), fallback to metadata parsing
        observedJob?.markdownConversionStatus ?? PlanContentParser.extractMarkdownConversionStatus(from: observedJob?.metadata)
    }

    private enum PlanDisplayStatus {
        case streamingXml
        case convertingToMarkdown
        case parsingMarkdown
        case ready
    }

    private var currentPlanStatus: PlanDisplayStatus {
        if isStreaming {
            return .streamingXml
        }
        // Never show "Converting" if we already have markdown content to display
        if showingMarkdown && !markdownContent.isEmpty {
            // Show parsing state while markdown is being parsed in background
            if parsedMarkdown == nil {
                return .parsingMarkdown
            }
            return .ready
        }
        // Only show converting status when truly converting and no content available
        if isConvertingToMarkdown || (markdownConversionStatus == "pending" && markdownContent.isEmpty) {
            return .convertingToMarkdown
        }
        return .ready
    }

    public init(jobId: String, allPlanJobIds: [String]) {
        self.jobId = jobId
        self.allPlanJobIds = allPlanJobIds
        let index = allPlanJobIds.firstIndex(of: jobId) ?? 0
        self._currentIndex = State(initialValue: index)
    }

    public var body: some View {
        ZStack {
            Color.backgroundPrimary.ignoresSafeArea()

            if isLoading {
                loadingView()
            } else if let error = errorMessage {
                errorView(message: error)
            } else {
                switch currentPlanStatus {
                case .streamingXml:
                    VStack(spacing: 12) {
                        ProgressView()
                            .tint(Color.primary)
                        Text("Streaming XML plan...")
                            .font(.body)
                            .fontWeight(.medium)
                            .foregroundColor(Color.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .convertingToMarkdown:
                    VStack(spacing: 12) {
                        ProgressView()
                            .tint(Color.primary)
                        Text("Converting to Markdown...")
                            .font(.body)
                            .fontWeight(.medium)
                            .foregroundColor(Color.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .parsingMarkdown:
                    VStack(spacing: 12) {
                        ProgressView()
                            .tint(Color.primary)
                        Text("Rendering plan...")
                            .font(.body)
                            .fontWeight(.medium)
                            .foregroundColor(Color.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .ready:
                    editorView()
                }
            }

            // Bottom overlay: floating toolbar + metadata strip (hidden in landscape)
            if !isLandscape {
                VStack(spacing: 0) {
                    Spacer()
                    bottomOverlay()
                }
                .ignoresSafeArea(.keyboard, edges: .bottom)
            }
        }
        .navigationTitle(
            PlanContentParser.extractPlanTitle(metadata: observedJob?.metadata, response: observedJob?.response)
            ?? observedJob?.taskType
            ?? "Implementation Plan"
        )
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarHidden(isLandscape)
        .statusBarHidden(isLandscape)
        .toolbar {
            // Save button (only if changes)
            if hasUnsavedChanges {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        savePlan()
                    } label: {
                        if isSaving {
                            ProgressView()
                                .scaleEffect(0.7)
                        } else {
                            Image(systemName: "checkmark")
                        }
                    }
                    .disabled(isSaving)
                }
            }
        }
        .sheet(isPresented: $showingTerminal) {
            NavigationStack {
                RemoteTerminalView(jobId: currentJobId)
            }
        }
        .alert("Unsaved Changes", isPresented: $showingSaveConfirmation) {
            Button("Discard", role: .destructive) {
                dismiss()
            }
            Button("Save") {
                savePlan()
                dismiss()
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("You have unsaved changes. What would you like to do?")
        }
        .task {
            if let dir = container.sessionService.currentSession?.projectDirectory, !dir.isEmpty {
                try? await container.settingsService.fetchProjectTaskModelSettings(projectDirectory: dir)
            }
        }
        .onAppear {
            container.jobsService.setViewedImplementationPlanId(currentJobId)
            hasInitializedContent = false
            xmlContent = ""
            markdownContent = ""
            parsedMarkdown = nil
            hasUnsavedChanges = false
            isEditMode = false
            loadPlanContent()
            if !isStreaming {
                triggerMarkdownConversionIfNeeded()
            }
        }
        .onDisappear {
            container.jobsService.setViewedImplementationPlanId(nil)
        }
        .onChange(of: observedJob?.response) { _ in
            loadPlanContent()
        }
        .onChange(of: observedJob?.metadata) { _ in
            reloadMarkdownFromJob()
        }
        .onChange(of: observedJob?.id) { _ in
            loadPlanContent()
        }
        .onChange(of: isStreaming) { newValue in
            if newValue == false {
                triggerMarkdownConversionIfNeeded()
            }
        }
        .onChange(of: markdownContent) { newContent in
            // Parse markdown on background thread to avoid blocking UI
            if !newContent.isEmpty {
                Task.detached(priority: .userInitiated) {
                    let parsed = MarkdownContent(newContent)
                    await MainActor.run {
                        self.parsedMarkdown = parsed
                    }
                }
            } else {
                parsedMarkdown = nil
            }
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
                .foregroundColor(Color.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.backgroundPrimary)
    }

    @ViewBuilder
    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Spacer()

            StatusAlertView(
                variant: .destructive,
                title: "Error Loading Plan",
                message: message
            )
            .padding()

            Button("Retry") {
                loadPlanContent()
            }
            .buttonStyle(PrimaryButtonStyle())

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.backgroundPrimary)
    }

    // MARK: - Editor View

    @ViewBuilder
    private func editorView() -> some View {
        // Landscape → always XML editor
        if isLandscape {
            PlanRunestoneEditorView(
                text: $xmlContent,
                isReadOnly: isStreaming || !isEditMode,
                languageHint: "xml"
            )
            .focused($isEditorFocused)
            .ignoresSafeArea(.keyboard)
            .background(Color.codeBackground)
            .onChange(of: xmlContent) { _ in
                if hasInitializedContent && !isStreaming && !isLoadingContent {
                    hasUnsavedChanges = true
                }
            }
        }
        // Portrait with showingMarkdown == true and markdown exists → markdown view
        else if showingMarkdown && !markdownContent.isEmpty {
            ScrollView {
                // Use pre-parsed markdown to avoid re-parsing on every render
                if let parsed = parsedMarkdown {
                    Markdown(parsed)
                        // NOTE: .textSelection(.enabled) removed for performance
                        // It causes severe lag with complex markdown documents
                        // Code blocks - smaller font
                        .markdownBlockStyle(\.codeBlock) { configuration in
                            configuration.label
                                .relativeLineSpacing(.em(0.2))
                                .markdownTextStyle {
                                    FontFamilyVariant(.monospaced)
                                    FontSize(.em(0.75))
                                }
                                .padding(12)
                                .background(Color.codeBackground)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .markdownMargin(top: 8, bottom: 8)
                        }
                        // Inline code - smaller font
                        .markdownTextStyle(\.code) {
                            FontFamilyVariant(.monospaced)
                            FontSize(.em(0.8))
                            BackgroundColor(Color.inlineCodeBackground)
                        }
                        // Lists - tighter indentation for mobile
                        .markdownBlockStyle(\.listItem) { configuration in
                            configuration.label
                                .markdownMargin(top: .em(0.15))
                        }
                        .markdownBlockStyle(\.bulletedListMarker) { configuration in
                            Text("•")
                                .relativeFrame(minWidth: .em(1.0), alignment: .trailing)
                        }
                        .markdownBlockStyle(\.numberedListMarker) { configuration in
                            Text("\(configuration.itemNumber).")
                                .relativeFrame(minWidth: .em(1.2), alignment: .trailing)
                        }
                        .padding()
                }
                // Note: No else branch needed - .parsingMarkdown state handles the nil case
            }
        }
        // Otherwise → XML editor
        else {
            PlanRunestoneEditorView(
                text: $xmlContent,
                isReadOnly: isStreaming || !isEditMode,
                languageHint: "xml"
            )
            .focused($isEditorFocused)
            .ignoresSafeArea(.keyboard)
            .background(Color.codeBackground)
            .onChange(of: xmlContent) { _ in
                if hasInitializedContent && !isStreaming && !isLoadingContent {
                    hasUnsavedChanges = true
                }
            }
        }
    }

    @ViewBuilder
    private func editorControls() -> some View {
        HStack(spacing: 0) {
            Button {
                isEditMode.toggle()
                if !isEditMode {
                    isEditorFocused = false
                }
            } label: {
                Image(systemName: isEditMode ? "pencil.circle.fill" : "pencil.circle")
                    .font(.title3)
                    .foregroundColor(Color.primary)
            }

            Spacer()
                .frame(width: 24)

            Button {
                navigateToPlan(direction: .previous)
            } label: {
                Image(systemName: "chevron.left")
                    .font(.title3)
                    .foregroundColor(canGoPrevious ? Color.textPrimary : Color.textMuted)
            }
            .disabled(!canGoPrevious)

            Spacer()
                .frame(width: 24)

            Button {
                navigateToPlan(direction: .next)
            } label: {
                Image(systemName: "chevron.right")
                    .font(.title3)
                    .foregroundColor(canGoNext ? Color.textPrimary : Color.textMuted)
            }
            .disabled(!canGoNext)

            Spacer()
                .frame(width: 40)

            Button {
                showingTerminal = true
            } label: {
                Image(systemName: "terminal")
                    .font(.title3)
                    .foregroundColor(Color.primary)
            }

            if !isLandscape && !markdownContent.isEmpty {
                Spacer()
                    .frame(width: 24)

                Button(showingMarkdown ? "Show Original" : "Show Markdown") {
                    showingMarkdown.toggle()
                }
                .font(.caption)
                .foregroundColor(Color.primary)
            }
        }
    }

    @ViewBuilder
    private func bottomOverlay() -> some View {
        VStack(spacing: 0) {
            floatingEditorToolbar()
            bottomMetadataView()
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .background(
            LinearGradient(
                gradient: Gradient(colors: [
                    Color.backgroundPrimary.opacity(0.0),
                    Color.backgroundPrimary.opacity(0.9)
                ]),
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea(edges: .bottom)
        )
    }

    @ViewBuilder
    private func floatingEditorToolbar() -> some View {
        HStack(spacing: 0) {
            editorControls()

            if isLandscape {
                Spacer()
                Button("Done") {
                    isEditorFocused = false
                }
                .buttonStyle(PrimaryButtonStyle())
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            Color.surfacePrimary
                .opacity(0.96)
        )
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.border),
            alignment: .top
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: Color.black.opacity(0.18), radius: 10, x: 0, y: 4)
    }

    @ViewBuilder
    private func bottomMetadataView() -> some View {
        HStack(spacing: 6) {
            if let job = observedJob {
                Text(formatDate(job.createdAt))
                    .font(.caption2)
                    .foregroundColor(Color.textMuted)

                if job.taskType == "implementation_plan_merge" {
                    Text("Merged")
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(dynamicColor(Theme.Semantic.Status.infoBackground))
                        .foregroundColor(Color.info)
                        .clipShape(Capsule())
                }

                if let modelName = PlanContentParser.extractModelName(metadata: job.metadata) {
                    Text("•")
                        .font(.caption2)
                        .foregroundColor(Color.textMuted.opacity(0.6))
                    Text(modelName)
                        .font(.caption2)
                        .foregroundColor(Color.textMuted)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            Color.surfacePrimary
                .opacity(0.85)
        )
        .clipShape(Capsule())
        .padding(.top, 6)
        .padding(.bottom, 4)
    }

    // MARK: - Computed Properties

    private var currentJobId: String {
        guard currentIndex >= 0 && currentIndex < allPlanJobIds.count else {
            return jobId
        }
        return allPlanJobIds[currentIndex]
    }

    private var canGoPrevious: Bool {
        return currentIndex > 0
    }

    private var canGoNext: Bool {
        return currentIndex < allPlanJobIds.count - 1
    }

    private func formatDate(_ timestamp: Int64) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(timestamp) / 1000)
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    // MARK: - Navigation

    private enum NavigationDirection {
        case previous
        case next
    }

    private func navigateToPlan(direction: NavigationDirection) {
        guard canGoPrevious || canGoNext else { return }

        let newIndex = direction == .previous ? currentIndex - 1 : currentIndex + 1
        guard newIndex >= 0 && newIndex < allPlanJobIds.count else { return }

        currentIndex = newIndex
        container.jobsService.setViewedImplementationPlanId(currentJobId)
        hasInitializedContent = false
        xmlContent = ""
        markdownContent = ""
        parsedMarkdown = nil
        hasUnsavedChanges = false
        isEditMode = false
        isEditorFocused = false

        loadPlanContent()
    }

    // MARK: - Data Loading

    private func reloadMarkdownFromJob() {
        guard let job = observedJob else { return }

        if let md = PlanContentParser.extractMarkdownResponse(from: job.metadata) {
            markdownContent = md
            if !isLandscape && !md.isEmpty {
                showingMarkdown = true
            }
        }
    }

    private func loadPlanContent() {
        guard let job = observedJob else { return }

        if !hasInitializedContent {
            xmlContent = job.response ?? xmlContent
        }

        reloadMarkdownFromJob()

        hasInitializedContent = true
    }

    private func savePlan() {
        isSaving = true
        errorMessage = nil

        Task {
            do {
                let result = try await container.jobsService.updateJobContent(jobId: currentJobId, newContent: xmlContent)
                await MainActor.run {
                    self.isSaving = false
                    self.hasUnsavedChanges = false
                    if let response = result.job.response {
                        self.xmlContent = response
                    }
                }
            } catch {
                await MainActor.run {
                    self.isSaving = false
                    self.errorMessage = "Save failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private func triggerMarkdownConversionIfNeeded() {
        // Guard 1: Job must exist
        guard let job = observedJob else { return }

        // Guard 2: Job must be in terminal state (no point converting while still running)
        guard job.jobStatus.isTerminal else { return }

        // Guard 3: Already completed conversion
        if markdownConversionStatus == "completed" {
            return
        }

        // Guard 4: Conversion already in progress (avoid duplicate triggers)
        if markdownConversionStatus == "pending" {
            return
        }

        // Guard 5: We already have markdown content locally
        if !markdownContent.isEmpty {
            return
        }

        // Guard 6: Metadata already has markdown response
        if PlanContentParser.extractMarkdownResponse(from: job.metadata) != nil {
            return
        }

        // All guards passed - trigger conversion
        isConvertingToMarkdown = true

        Task {
            defer {
                Task { @MainActor in
                    self.isConvertingToMarkdown = false
                }
            }

            await container.jobsService.generatePlanMarkdown(jobId: job.id)

            await MainActor.run {
                self.reloadMarkdownFromJob()
            }
        }
    }

}

// MARK: - Supporting Views
// (None needed - all inline)

#if DEBUG
#Preview {
    let jobId = "job-1"
    let allPlanJobIds = ["job-1", "job-2", "job-3"]

    PlanDetailView(jobId: jobId, allPlanJobIds: allPlanJobIds)
        .environmentObject(AppContainer.preview)
}
#endif