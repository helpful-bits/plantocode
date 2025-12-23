# Flexible Web Search Framework Examples

## How It Works

The new framework adapts to different research needs through:

### 1. **Adaptive Query Generation**
Instead of limiting to 3 API/library prompts, it generates appropriate queries based on:
- Task type and scope
- Number of documents/topics
- Research depth needed
- Source requirements

### 2. **Intelligent Execution**
The executor adapts its approach based on the task:
- Documentation improvement → Fact-checking and modernization
- Content optimization → Gap analysis and coverage
- Technical verification → Official source validation
- General research → Comprehensive exploration

## Example Scenarios

### Scenario 1: Multiple Documentation Pages
**Task**: Update 10 documentation pages for different features

**Generator Output**:
```json
{
  "research_batch": {
    "task_type": "documentation_improvement",
    "processing_mode": "parallel",
    "source_requirements": "authoritative_preferred",
    "queries": [
      {
        "id": "q1",
        "target": "authentication-docs",
        "priority": "high",
        "research_goals": [
          "Verify OAuth 2.0 best practices 2025",
          "Check latest security recommendations",
          "Find modern authentication patterns"
        ],
        "search_queries": [
          "OAuth 2.0 best practices 2025 official",
          "authentication security OWASP latest"
        ]
      },
      {
        "id": "q2",
        "target": "api-rate-limiting-docs",
        "priority": "medium",
        "research_goals": [
          "Current rate limiting strategies",
          "Industry standard limits",
          "Implementation examples"
        ]
      }
      // ... more queries for other pages
    ]
  }
}
```

### Scenario 2: Content Optimization (SEO Example)
**Task**: Optimize documentation for discoverability

**Generator adapts to**:
- Identify key terminology in the field
- Research what competitors cover
- Find missing topics users search for
- Verify technical accuracy

### Scenario 3: Technical Migration
**Task**: Update all code examples from library v3 to v5

**Generator creates**:
- Breaking change research queries
- Migration guide searches
- New API pattern queries
- Deprecation verification

### Scenario 4: Best Practices Update
**Task**: Ensure all tutorials follow current best practices

**The framework**:
- Researches current standards
- Finds official recommendations
- Identifies outdated patterns
- Suggests modern alternatives

## Key Advantages

1. **Scalability**: Handles 1 to 100+ documents efficiently
2. **Flexibility**: Adapts to any research need, not just API docs
3. **Batch Processing**: Groups related queries intelligently
4. **Quality Control**: Maintains source authority while being less restrictive
5. **Actionable Output**: Provides specific recommendations, not just information
6. **Progressive Enhancement**: Can start broad and refine based on findings

## Integration Points

The framework integrates with your workflow by:
- Reading your documentation structure
- Understanding your content goals
- Generating appropriate research strategies
- Providing specific improvement recommendations
- Supporting iterative refinement

## Customization Options

You can adjust:
- Source requirements (official-only vs broader)
- Processing mode (parallel vs sequential)
- Research depth (quick check vs deep analysis)
- Output format (detailed vs summary)
- Validation criteria (strict vs flexible)