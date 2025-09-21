import Foundation

// MARK: - Base Workflow Types

public enum WorkflowPriority: String, Codable {
    case low = "Low"
    case normal = "Normal"
    case high = "High"
    case critical = "Critical"
}

public enum WorkflowJobStatus: String, Codable {
    case queued = "Queued"
    case running = "Running"
    case completed = "Completed"
    case failed = "Failed"
    case cancelled = "Cancelled"
    case paused = "Paused"
}

public struct BaseWorkflowParams: Codable {
    public let mobileSessionId: String
    public let priority: WorkflowPriority
    public let metadata: [String: AnyJSON]

    public init(mobileSessionId: String, priority: WorkflowPriority = .normal, metadata: [String: AnyJSON] = [:]) {
        self.mobileSessionId = mobileSessionId
        self.priority = priority
        self.metadata = metadata
    }
}

public struct WorkflowProgress: Codable {
    public let currentStep: String
    public let totalSteps: Int?
    public let completedSteps: Int
    public let percentage: Float
    public let estimatedRemainingSeconds: Int?
}

public struct WorkflowResult<T: Codable>: Codable {
    public let id: UUID
    public let status: WorkflowJobStatus
    public let result: T?
    public let error: String?
    public let progress: WorkflowProgress?
    public let createdAt: Date
    public let updatedAt: Date
    public let completedAt: Date?
    public let metadata: [String: AnyJSON]
}

public enum WorkflowEventType: String, Codable {
    case started = "Started"
    case progress = "Progress"
    case partialResult = "PartialResult"
    case completed = "Completed"
    case failed = "Failed"
    case cancelled = "Cancelled"
    case statusUpdate = "StatusUpdate"
}

public struct WorkflowStreamEvent<T: Codable>: Codable {
    public let workflowId: UUID
    public let eventType: WorkflowEventType
    public let data: T?
    public let timestamp: Date
}

// MARK: - File Search Types

public struct FileSearchParams: Codable {
    public let base: BaseWorkflowParams
    public let pattern: String
    public let paths: [String]
    public let fileTypes: [String]
    public let excludePatterns: [String]
    public let caseSensitive: Bool
    public let includeContent: Bool
    public let maxResults: Int?
    public let maxFileSizeMb: UInt64?

    public init(
        base: BaseWorkflowParams,
        pattern: String,
        paths: [String],
        fileTypes: [String] = [],
        excludePatterns: [String] = [],
        caseSensitive: Bool = false,
        includeContent: Bool = true,
        maxResults: Int? = nil,
        maxFileSizeMb: UInt64? = nil
    ) {
        self.base = base
        self.pattern = pattern
        self.paths = paths
        self.fileTypes = fileTypes
        self.excludePatterns = excludePatterns
        self.caseSensitive = caseSensitive
        self.includeContent = includeContent
        self.maxResults = maxResults
        self.maxFileSizeMb = maxFileSizeMb
    }
}

public struct FileSearchResult: Codable {
    public let filePath: String
    public let relativePath: String
    public let fileName: String
    public let fileSize: UInt64
    public let modifiedAt: Date
    public let fileType: String
    public let matches: [FileMatch]
    public let contentSnippet: String?
    public let metadata: FileMetadata
}

public struct FileMatch: Codable {
    public let lineNumber: UInt32
    public let columnStart: UInt32
    public let columnEnd: UInt32
    public let lineContent: String
    public let matchText: String
    public let contextBefore: [String]
    public let contextAfter: [String]
}

public struct FileMetadata: Codable {
    public let isBinary: Bool
    public let isHidden: Bool
    public let isGitTracked: Bool
    public let gitStatus: String?
    public let language: String?
    public let encoding: String?
    public let lineCount: UInt32?
}

public struct FileSearchWorkflowResult: Codable {
    public let totalFilesScanned: UInt64
    public let totalMatchesFound: UInt64
    public let results: [FileSearchResult]
    public let searchStats: SearchStatistics
    public let truncated: Bool
    public let searchDurationMs: UInt64
}

public struct SearchStatistics: Codable {
    public let directoriesScanned: UInt64
    public let filesProcessed: UInt64
    public let filesSkipped: UInt64
    public let binaryFilesExcluded: UInt64
    public let largeFilesExcluded: UInt64
    public let permissionErrors: UInt64
    public let processingRateFilesPerSec: Double
}

// MARK: - Research Types

public enum ResearchDepth: String, Codable {
    case basic = "Basic"
    case standard = "Standard"
    case deep = "Deep"
    case expert = "Expert"
}

public enum ResearchSource: Codable {
    case webSearch(query: String, domains: [String], excludeDomains: [String])
    case fileSystem(paths: [String], fileTypes: [String], searchPatterns: [String])
    case codeAnalysis(repositories: [String], languages: [String], analysisTypes: [String])
    case documentation(urls: [String], localPaths: [String])
    case database(connectionString: String, queries: [String])
}

public struct ResearchParams: Codable {
    public let base: BaseWorkflowParams
    public let topic: String
    public let researchDepth: ResearchDepth
    public let sources: [ResearchSource]
    public let maxSources: Int?
    public let includeWebSearch: Bool
    public let includeFileAnalysis: Bool
    public let includeCodeAnalysis: Bool
    public let outputFormat: ResearchOutputFormat
    public let language: String
    public let customPrompts: [String]

    public init(
        base: BaseWorkflowParams,
        topic: String,
        researchDepth: ResearchDepth = .standard,
        sources: [ResearchSource],
        maxSources: Int? = nil,
        includeWebSearch: Bool = true,
        includeFileAnalysis: Bool = false,
        includeCodeAnalysis: Bool = false,
        outputFormat: ResearchOutputFormat = .markdown,
        language: String = "en",
        customPrompts: [String] = []
    ) {
        self.base = base
        self.topic = topic
        self.researchDepth = researchDepth
        self.sources = sources
        self.maxSources = maxSources
        self.includeWebSearch = includeWebSearch
        self.includeFileAnalysis = includeFileAnalysis
        self.includeCodeAnalysis = includeCodeAnalysis
        self.outputFormat = outputFormat
        self.language = language
        self.customPrompts = customPrompts
    }
}

public enum ResearchOutputFormat: String, Codable {
    case markdown = "Markdown"
    case html = "Html"
    case json = "Json"
    case structured = "Structured"
    case summary = "Summary"
}

public struct ResearchWorkflowResult: Codable {
    public let topic: String
    public let executiveSummary: String
    public let keyFindings: [ResearchFinding]
    public let structuredReport: StructuredReport
    public let citations: [ResearchCitation]
    public let researchStatistics: ResearchStatistics
    public let recommendations: [String]
    public let relatedTopics: [String]
    public let confidenceRating: Float
    public let researchDurationMs: UInt64
}

public struct ResearchFinding: Codable {
    public let id: UUID
    public let sourceType: String
    public let sourceUrl: String?
    public let sourcePath: String?
    public let title: String
    public let content: String
    public let summary: String
    public let relevanceScore: Float
    public let confidenceScore: Float
    public let tags: [String]
    public let metadata: [String: AnyJSON]
    public let createdAt: Date
}

public struct StructuredReport: Codable {
    public let sections: [ReportSection]
    public let tableOfContents: [TocEntry]
    public let appendices: [Appendix]
    public let glossary: [String: String]
}

public struct ReportSection: Codable {
    public let id: String
    public let title: String
    public let content: String
    public let subsections: [ReportSection]
    public let findings: [UUID]
    public let order: UInt32
}

public struct TocEntry: Codable {
    public let sectionId: String
    public let title: String
    public let level: UInt32
    public let pageNumber: UInt32?
}

public struct Appendix: Codable {
    public let title: String
    public let content: String
    public let appendixType: AppendixType
}

public enum AppendixType: String, Codable {
    case rawData = "RawData"
    case code = "Code"
    case charts = "Charts"
    case references = "References"
    case methodology = "Methodology"
}

public struct ResearchCitation: Codable {
    public let id: UUID
    public let findingId: UUID
    public let citationType: CitationType
    public let title: String
    public let authors: [String]
    public let url: String?
    public let publicationDate: Date?
    public let publisher: String?
    public let doi: String?
}

public enum CitationType: String, Codable {
    case webPage = "WebPage"
    case article = "Article"
    case documentation = "Documentation"
    case sourceCode = "SourceCode"
    case book = "Book"
    case paper = "Paper"
    case blog = "Blog"
    case forum = "Forum"
}

public struct ResearchStatistics: Codable {
    public let totalSourcesAnalyzed: UInt64
    public let webPagesProcessed: UInt64
    public let filesAnalyzed: UInt64
    public let codeRepositoriesScanned: UInt64
    public let totalTokensProcessed: UInt64
    public let totalTokensGenerated: UInt64
    public let llmApiCalls: UInt64
    public let researchCostUsd: Double
    public let averageRelevanceScore: Float
    public let averageConfidenceScore: Float
}

// MARK: - Task Improvement Types

public enum ImprovementType: Codable {
    case clarity
    case conciseness
    case engagement
    case professionalism
    case technical
    case grammar
    case structure
    case completeness
    case specificity
    case accessibility
    case custom(String)
}

public enum TargetAudience: Codable {
    case general
    case technical
    case executive
    case academic
    case students
    case customers
    case teamMembers
    case stakeholders
    case developers
    case designers
    case custom(String)
}

public struct TaskImprovementParams: Codable {
    public let base: BaseWorkflowParams
    public let originalText: String
    public let improvementType: ImprovementType
    public let targetAudience: TargetAudience
    public let stylePreferences: StylePreferences
    public let contentRequirements: ContentRequirements
    public let constraints: TaskConstraints
    public let revisionHistory: [RevisionEntry]
    public let customInstructions: [String]

    public init(
        base: BaseWorkflowParams,
        originalText: String,
        improvementType: ImprovementType,
        targetAudience: TargetAudience = .general,
        stylePreferences: StylePreferences = StylePreferences(),
        contentRequirements: ContentRequirements = ContentRequirements(),
        constraints: TaskConstraints = TaskConstraints(),
        revisionHistory: [RevisionEntry] = [],
        customInstructions: [String] = []
    ) {
        self.base = base
        self.originalText = originalText
        self.improvementType = improvementType
        self.targetAudience = targetAudience
        self.stylePreferences = stylePreferences
        self.contentRequirements = contentRequirements
        self.constraints = constraints
        self.revisionHistory = revisionHistory
        self.customInstructions = customInstructions
    }
}

public struct StylePreferences: Codable {
    public let tone: TextTone
    public let formality: FormalityLevel
    public let voice: VoiceType
    public let perspective: PerspectiveType
    public let lengthPreference: LengthPreference
    public let complexityLevel: ComplexityLevel

    public init(
        tone: TextTone = .professional,
        formality: FormalityLevel = .formal,
        voice: VoiceType = .active,
        perspective: PerspectiveType = .thirdPerson,
        lengthPreference: LengthPreference = .sameLength,
        complexityLevel: ComplexityLevel = .moderate
    ) {
        self.tone = tone
        self.formality = formality
        self.voice = voice
        self.perspective = perspective
        self.lengthPreference = lengthPreference
        self.complexityLevel = complexityLevel
    }
}

public enum TextTone: String, Codable {
    case professional = "Professional"
    case friendly = "Friendly"
    case authoritative = "Authoritative"
    case conversational = "Conversational"
    case formal = "Formal"
    case informal = "Informal"
    case persuasive = "Persuasive"
    case neutral = "Neutral"
    case enthusiastic = "Enthusiastic"
    case empathetic = "Empathetic"
}

public enum FormalityLevel: String, Codable {
    case veryFormal = "VeryFormal"
    case formal = "Formal"
    case semiFormal = "SemiFormal"
    case informal = "Informal"
    case veryInformal = "VeryInformal"
}

public enum VoiceType: String, Codable {
    case active = "Active"
    case passive = "Passive"
    case mixed = "Mixed"
}

public enum PerspectiveType: String, Codable {
    case firstPerson = "FirstPerson"
    case secondPerson = "SecondPerson"
    case thirdPerson = "ThirdPerson"
    case mixed = "Mixed"
}

public enum LengthPreference: String, Codable {
    case shorter = "Shorter"
    case sameLength = "SameLength"
    case longer = "Longer"
    case noPreference = "NoPreference"
}

public enum ComplexityLevel: String, Codable {
    case simple = "Simple"
    case moderate = "Moderate"
    case complex = "Complex"
    case expert = "Expert"
}

public struct ContentRequirements: Codable {
    public let mustInclude: [String]
    public let mustExclude: [String]
    public let keyMessages: [String]
    public let callToAction: String?
    public let maintainOriginalMeaning: Bool
    public let preserveSpecificTerms: [String]
    public let includeExamples: Bool
    public let includeReferences: Bool

    public init(
        mustInclude: [String] = [],
        mustExclude: [String] = [],
        keyMessages: [String] = [],
        callToAction: String? = nil,
        maintainOriginalMeaning: Bool = true,
        preserveSpecificTerms: [String] = [],
        includeExamples: Bool = false,
        includeReferences: Bool = false
    ) {
        self.mustInclude = mustInclude
        self.mustExclude = mustExclude
        self.keyMessages = keyMessages
        self.callToAction = callToAction
        self.maintainOriginalMeaning = maintainOriginalMeaning
        self.preserveSpecificTerms = preserveSpecificTerms
        self.includeExamples = includeExamples
        self.includeReferences = includeReferences
    }
}

public struct TaskConstraints: Codable {
    public let maxLengthWords: UInt32?
    public let minLengthWords: UInt32?
    public let maxSentences: UInt32?
    public let readingLevel: ReadingLevel?
    public let deadline: Date?
    public let budgetConstraint: Double?
    public let iterationsLimit: UInt32?

    public init(
        maxLengthWords: UInt32? = nil,
        minLengthWords: UInt32? = nil,
        maxSentences: UInt32? = nil,
        readingLevel: ReadingLevel? = nil,
        deadline: Date? = nil,
        budgetConstraint: Double? = nil,
        iterationsLimit: UInt32? = nil
    ) {
        self.maxLengthWords = maxLengthWords
        self.minLengthWords = minLengthWords
        self.maxSentences = maxSentences
        self.readingLevel = readingLevel
        self.deadline = deadline
        self.budgetConstraint = budgetConstraint
        self.iterationsLimit = iterationsLimit
    }
}

public enum ReadingLevel: String, Codable {
    case elementary = "Elementary"
    case middleSchool = "MiddleSchool"
    case highSchool = "HighSchool"
    case college = "College"
    case graduate = "Graduate"
    case professional = "Professional"
}

public struct RevisionEntry: Codable {
    public let version: UInt32
    public let text: String
    public let improvementType: ImprovementType
    public let feedback: String?
    public let createdAt: Date
    public let createdBy: String
    public let approved: Bool
}

public struct TaskImprovementWorkflowResult: Codable {
    public let originalText: String
    public let improvedText: String
    public let improvementSummary: String
    public let changesMade: [TextChange]
    public let qualityMetrics: QualityMetrics
    public let alternatives: [TextAlternative]
    public let validationResults: ValidationResults
    public let improvementStatistics: ImprovementStatistics
    public let suggestions: [String]
    public let undoInformation: UndoInformation
}

public struct TextChange: Codable {
    public let changeId: UUID
    public let changeType: ChangeType
    public let originalText: String
    public let newText: String
    public let position: TextPosition
    public let reason: String
    public let confidenceScore: Float
    public let impactScore: Float
}

public enum ChangeType: String, Codable {
    case wordChoice = "WordChoice"
    case sentenceStructure = "SentenceStructure"
    case paragraph = "Paragraph"
    case addition = "Addition"
    case deletion = "Deletion"
    case reordering = "Reordering"
    case formatting = "Formatting"
    case punctuationGrammar = "PunctuationGrammar"
    case tone = "Tone"
    case clarity = "Clarity"
}

public struct TextPosition: Codable {
    public let startChar: UInt32
    public let endChar: UInt32
    public let startLine: UInt32
    public let endLine: UInt32
    public let startParagraph: UInt32
    public let endParagraph: UInt32
}

public struct QualityMetrics: Codable {
    public let readabilityScore: Float
    public let clarityScore: Float
    public let engagementScore: Float
    public let grammarScore: Float
    public let coherenceScore: Float
    public let completenessScore: Float
    public let toneConsistencyScore: Float
    public let overallQualityScore: Float
}

public struct TextAlternative: Codable {
    public let alternativeId: UUID
    public let text: String
    public let focus: ImprovementType
    public let qualityMetrics: QualityMetrics
    public let pros: [String]
    public let cons: [String]
}

public struct ValidationResults: Codable {
    public let meetsRequirements: Bool
    public let constraintViolations: [String]
    public let qualityChecks: [String: Bool]
    public let accessibilityScore: Float
    public let seoScore: Float?
    public let plagiarismCheck: PlagiarismResult?
}

public struct PlagiarismResult: Codable {
    public let similarityPercentage: Float
    public let sourcesFound: [String]
    public let isLikelyPlagiarized: Bool
}

public struct ImprovementStatistics: Codable {
    public let originalWordCount: UInt32
    public let improvedWordCount: UInt32
    public let originalSentenceCount: UInt32
    public let improvedSentenceCount: UInt32
    public let changesCount: UInt32
    public let processingTimeMs: UInt64
    public let llmTokensUsed: UInt64
    public let improvementCost: Double
    public let iterationsPerformed: UInt32
}

public struct UndoInformation: Codable {
    public let originalText: String
    public let changeHistory: [TextChange]
    public let checkpointVersions: [String]
    public let canUndo: Bool
    public let canRedo: Bool
}

// MARK: - Voice Dictation Types

public enum AudioFormat: String, Codable {
    case mp3 = "Mp3"
    case m4a = "M4a"
    case wav = "Wav"
    case flac = "Flac"
    case aac = "Aac"
    case ogg = "Ogg"
    case webM = "WebM"
}

public enum LanguageCode: String, Codable {
    case english = "English"
    case spanish = "Spanish"
    case french = "French"
    case german = "German"
    case italian = "Italian"
    case portuguese = "Portuguese"
    case russian = "Russian"
    case chinese = "Chinese"
    case japanese = "Japanese"
    case korean = "Korean"
    case arabic = "Arabic"
    case hindi = "Hindi"
    case dutch = "Dutch"
    case swedish = "Swedish"
    case norwegian = "Norwegian"
    case danish = "Danish"
    case finnish = "Finnish"
    case polish = "Polish"
    case czech = "Czech"
    case hungarian = "Hungarian"
    case custom(String)
}

public struct VoiceDictationParams: Codable {
    public let base: BaseWorkflowParams
    public let audioFilePath: String
    public let audioFormat: AudioFormat
    public let language: LanguageCode
    public let transcriptionOptions: TranscriptionOptions
    public let postProcessing: PostProcessingOptions
    public let outputOptions: OutputOptions
    public let qualityRequirements: QualityRequirements

    public init(
        base: BaseWorkflowParams,
        audioFilePath: String,
        audioFormat: AudioFormat,
        language: LanguageCode = .english,
        transcriptionOptions: TranscriptionOptions = TranscriptionOptions(),
        postProcessing: PostProcessingOptions = PostProcessingOptions(),
        outputOptions: OutputOptions = OutputOptions(),
        qualityRequirements: QualityRequirements = QualityRequirements()
    ) {
        self.base = base
        self.audioFilePath = audioFilePath
        self.audioFormat = audioFormat
        self.language = language
        self.transcriptionOptions = transcriptionOptions
        self.postProcessing = postProcessing
        self.outputOptions = outputOptions
        self.qualityRequirements = qualityRequirements
    }
}

public struct TranscriptionOptions: Codable {
    public let model: WhisperModel
    public let temperature: Float
    public let wordTimestamps: Bool
    public let sentenceTimestamps: Bool
    public let speakerDiarization: Bool
    public let noiseReduction: Bool
    public let voiceActivityDetection: Bool
    public let customVocabulary: [String]
    public let contextPrompt: String?

    public init(
        model: WhisperModel = .small,
        temperature: Float = 0.0,
        wordTimestamps: Bool = false,
        sentenceTimestamps: Bool = true,
        speakerDiarization: Bool = false,
        noiseReduction: Bool = true,
        voiceActivityDetection: Bool = true,
        customVocabulary: [String] = [],
        contextPrompt: String? = nil
    ) {
        self.model = model
        self.temperature = temperature
        self.wordTimestamps = wordTimestamps
        self.sentenceTimestamps = sentenceTimestamps
        self.speakerDiarization = speakerDiarization
        self.noiseReduction = noiseReduction
        self.voiceActivityDetection = voiceActivityDetection
        self.customVocabulary = customVocabulary
        self.contextPrompt = contextPrompt
    }
}

public enum WhisperModel: String, Codable {
    case tiny = "Tiny"
    case base = "Base"
    case small = "Small"
    case medium = "Medium"
    case large = "Large"
    case largeV2 = "LargeV2"
    case largeV3 = "LargeV3"
}

public struct PostProcessingOptions: Codable {
    public let autoPunctuation: Bool
    public let autoCapitalization: Bool
    public let removeFillerWords: Bool
    public let normalizeNumbers: Bool
    public let spellCheck: Bool
    public let grammarCorrection: Bool
    public let paragraphSegmentation: Bool
    public let sentenceCompletion: Bool
    public let customReplacements: [String: String]

    public init(
        autoPunctuation: Bool = true,
        autoCapitalization: Bool = true,
        removeFillerWords: Bool = false,
        normalizeNumbers: Bool = true,
        spellCheck: Bool = true,
        grammarCorrection: Bool = false,
        paragraphSegmentation: Bool = true,
        sentenceCompletion: Bool = false,
        customReplacements: [String: String] = [:]
    ) {
        self.autoPunctuation = autoPunctuation
        self.autoCapitalization = autoCapitalization
        self.removeFillerWords = removeFillerWords
        self.normalizeNumbers = normalizeNumbers
        self.spellCheck = spellCheck
        self.grammarCorrection = grammarCorrection
        self.paragraphSegmentation = paragraphSegmentation
        self.sentenceCompletion = sentenceCompletion
        self.customReplacements = customReplacements
    }
}

public struct OutputOptions: Codable {
    public let format: TranscriptionFormat
    public let includeMetadata: Bool
    public let includeConfidenceScores: Bool
    public let includeTimestamps: Bool
    public let includeWordLevelData: Bool
    public let chunkBySentences: Bool
    public let maxChunkLength: UInt32?

    public init(
        format: TranscriptionFormat = .plainText,
        includeMetadata: Bool = true,
        includeConfidenceScores: Bool = false,
        includeTimestamps: Bool = false,
        includeWordLevelData: Bool = false,
        chunkBySentences: Bool = true,
        maxChunkLength: UInt32? = nil
    ) {
        self.format = format
        self.includeMetadata = includeMetadata
        self.includeConfidenceScores = includeConfidenceScores
        self.includeTimestamps = includeTimestamps
        self.includeWordLevelData = includeWordLevelData
        self.chunkBySentences = chunkBySentences
        self.maxChunkLength = maxChunkLength
    }
}

public enum TranscriptionFormat: String, Codable {
    case plainText = "PlainText"
    case json = "Json"
    case srt = "Srt"
    case vtt = "Vtt"
    case markdown = "Markdown"
    case structured = "Structured"
}

public struct QualityRequirements: Codable {
    public let minConfidenceThreshold: Float
    public let maxProcessingTimeMinutes: UInt32?
    public let requireSpeakerIdentification: Bool
    public let accuracyTarget: AccuracyTarget
    public let retryOnLowQuality: Bool
    public let manualReviewThreshold: Float

    public init(
        minConfidenceThreshold: Float = 0.8,
        maxProcessingTimeMinutes: UInt32? = nil,
        requireSpeakerIdentification: Bool = false,
        accuracyTarget: AccuracyTarget = .standard,
        retryOnLowQuality: Bool = false,
        manualReviewThreshold: Float = 0.7
    ) {
        self.minConfidenceThreshold = minConfidenceThreshold
        self.maxProcessingTimeMinutes = maxProcessingTimeMinutes
        self.requireSpeakerIdentification = requireSpeakerIdentification
        self.accuracyTarget = accuracyTarget
        self.retryOnLowQuality = retryOnLowQuality
        self.manualReviewThreshold = manualReviewThreshold
    }
}

public enum AccuracyTarget: String, Codable {
    case basic = "Basic"      // 85%+ accuracy
    case standard = "Standard" // 90%+ accuracy
    case high = "High"         // 95%+ accuracy
    case perfect = "Perfect"   // 98%+ accuracy
}

public struct VoiceDictationWorkflowResult: Codable {
    public let transcription: TranscriptionResult
    public let audioMetadata: AudioMetadata
    public let processingStatistics: ProcessingStatistics
    public let qualityAssessment: QualityAssessment
    public let segments: [TranscriptionSegment]
    public let speakers: [SpeakerInfo]
    public let alternatives: [TranscriptionAlternative]
    public let postProcessingLog: [ProcessingStep]
}

public struct TranscriptionResult: Codable {
    public let text: String
    public let languageDetected: LanguageCode
    public let confidenceScore: Float
    public let wordCount: UInt32
    public let durationSeconds: Float
    public let processingTimeMs: UInt64
    public let modelUsed: WhisperModel
}

public struct AudioMetadata: Codable {
    public let fileSizeBytes: UInt64
    public let durationSeconds: Float
    public let sampleRate: UInt32
    public let channels: UInt32
    public let bitRate: UInt32?
    public let format: AudioFormat
    public let qualityScore: Float
    public let noiseLevel: NoiseLevel
    public let volumeLevels: VolumeAnalysis
}

public enum NoiseLevel: String, Codable {
    case veryLow = "VeryLow"
    case low = "Low"
    case moderate = "Moderate"
    case high = "High"
    case veryHigh = "VeryHigh"
}

public struct VolumeAnalysis: Codable {
    public let averageDb: Float
    public let peakDb: Float
    public let dynamicRange: Float
    public let silentSections: [TimeRange]
    public let loudSections: [TimeRange]
}

public struct TimeRange: Codable {
    public let startSeconds: Float
    public let endSeconds: Float
    public let durationSeconds: Float
}

public struct ProcessingStatistics: Codable {
    public let totalProcessingTimeMs: UInt64
    public let audioPreprocessingTimeMs: UInt64
    public let transcriptionTimeMs: UInt64
    public let postProcessingTimeMs: UInt64
    public let chunksProcessed: UInt32
    public let apiCallsMade: UInt32
    public let tokensConsumed: UInt64
    public let processingCostUsd: Double
    public let retryCount: UInt32
}

public struct QualityAssessment: Codable {
    public let overallQualityScore: Float
    public let transcriptionAccuracy: Float
    public let audioQualityScore: Float
    public let speakerClarityScore: Float
    public let languageDetectionConfidence: Float
    public let issuesDetected: [QualityIssue]
    public let recommendations: [String]
    public let meetsRequirements: Bool
}

public struct QualityIssue: Codable {
    public let issueType: QualityIssueType
    public let severity: IssueSeverity
    public let description: String
    public let timeRange: TimeRange?
    public let suggestedFix: String?
}

public enum QualityIssueType: String, Codable {
    case lowAudioQuality = "LowAudioQuality"
    case backgroundNoise = "BackgroundNoise"
    case multipleSpeakers = "MultipleSpeakers"
    case fastSpeech = "FastSpeech"
    case mumbling = "Mumbling"
    case lowVolume = "LowVolume"
    case distortion = "Distortion"
    case languageMismatch = "LanguageMismatch"
    case lowConfidence = "LowConfidence"
}

public enum IssueSeverity: String, Codable {
    case low = "Low"
    case medium = "Medium"
    case high = "High"
    case critical = "Critical"
}

public struct TranscriptionSegment: Codable {
    public let id: UUID
    public let text: String
    public let startTime: Float
    public let endTime: Float
    public let speakerId: String?
    public let confidenceScore: Float
    public let words: [WordInfo]
    public let segmentType: SegmentType
}

public enum SegmentType: String, Codable {
    case speech = "Speech"
    case silence = "Silence"
    case noise = "Noise"
    case music = "Music"
    case unknown = "Unknown"
}

public struct WordInfo: Codable {
    public let word: String
    public let startTime: Float
    public let endTime: Float
    public let confidence: Float
    public let speakerId: String?
    public let punctuation: String?
}

public struct SpeakerInfo: Codable {
    public let speakerId: String
    public let name: String?
    public let gender: Gender?
    public let estimatedAgeRange: AgeRange?
    public let accent: String?
    public let speakingTimeSeconds: Float
    public let wordCount: UInt32
    public let averageConfidence: Float
}

public enum Gender: String, Codable {
    case male = "Male"
    case female = "Female"
    case unknown = "Unknown"
}

public enum AgeRange: String, Codable {
    case child = "Child"           // 0-12
    case teen = "Teen"             // 13-17
    case youngAdult = "YoungAdult" // 18-30
    case adult = "Adult"           // 31-50
    case middleAge = "MiddleAge"   // 51-65
    case senior = "Senior"         // 65+
    case unknown = "Unknown"
}

public struct TranscriptionAlternative: Codable {
    public let alternativeId: UUID
    public let text: String
    public let confidenceScore: Float
    public let modelUsed: WhisperModel
    public let processingApproach: String
    public let pros: [String]
    public let cons: [String]
}

public struct ProcessingStep: Codable {
    public let stepName: String
    public let description: String
    public let changesMade: UInt32
    public let processingTimeMs: UInt64
    public let success: Bool
    public let errorMessage: String?
}

// MARK: - Utility Types

public struct AnyJSON: Codable {
    public let value: Any

    public init(_ value: Any) {
        self.value = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let intValue = try? container.decode(Int.self) {
            value = intValue
        } else if let doubleValue = try? container.decode(Double.self) {
            value = doubleValue
        } else if let stringValue = try? container.decode(String.self) {
            value = stringValue
        } else if let boolValue = try? container.decode(Bool.self) {
            value = boolValue
        } else if let arrayValue = try? container.decode([AnyJSON].self) {
            value = arrayValue.map { $0.value }
        } else if let dictValue = try? container.decode([String: AnyJSON].self) {
            value = dictValue.mapValues { $0.value }
        } else {
            throw DecodingError.typeMismatch(AnyJSON.self, DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unsupported JSON type"))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch value {
        case let intValue as Int:
            try container.encode(intValue)
        case let doubleValue as Double:
            try container.encode(doubleValue)
        case let stringValue as String:
            try container.encode(stringValue)
        case let boolValue as Bool:
            try container.encode(boolValue)
        case let arrayValue as [Any]:
            let anyJSONArray = arrayValue.map { AnyJSON($0) }
            try container.encode(anyJSONArray)
        case let dictValue as [String: Any]:
            let anyJSONDict = dictValue.mapValues { AnyJSON($0) }
            try container.encode(anyJSONDict)
        default:
            throw EncodingError.invalidValue(value, EncodingError.Context(codingPath: encoder.codingPath, debugDescription: "Unsupported JSON type"))
        }
    }
}