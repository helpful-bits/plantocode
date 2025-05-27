"use client";

import { X, Wand2 } from "lucide-react";
import React from "react";

import { Textarea } from "@/ui/textarea";
import { Button } from "@/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";

interface RegexInputProps {
  // Regex patterns (read-only display)
  titleRegex: string;
  contentRegex: string;
  negativeTitleRegex: string;
  negativeContentRegex: string;
  
  // Description fields (user input)
  titleRegexDescription: string;
  contentRegexDescription: string;
  negativeTitleRegexDescription: string;
  negativeContentRegexDescription: string;
  
  // Description change handlers
  onTitleRegexDescriptionChange: (value: string) => void;
  onContentRegexDescriptionChange: (value: string) => void;
  onNegativeTitleRegexDescriptionChange: (value: string) => void;
  onNegativeContentRegexDescriptionChange: (value: string) => void;
  
  // Generation handlers
  onGenerateTitleRegex: (description: string) => Promise<void>;
  onGenerateContentRegex: (description: string) => Promise<void>;
  onGenerateNegativeTitleRegex: (description: string) => Promise<void>;
  onGenerateNegativeContentRegex: (description: string) => Promise<void>;
  
  // Validation errors
  titleRegexError?: string | null;
  contentRegexError?: string | null;
  negativeTitleRegexError?: string | null;
  negativeContentRegexError?: string | null;
  
  // Generation state (granular per field)
  generatingFieldType?: 'title' | 'content' | 'negativeTitle' | 'negativeContent' | null;
  fieldRegexGenerationError?: string | null;
  
  // Legacy generation state (for backward compatibility)
  isGenerating?: boolean;
  
  onClearPatterns?: () => void;
  disabled?: boolean;
}

// Helper component for a single regex field
interface RegexFieldProps {
  title: string;
  description: string;
  onDescriptionChange: (value: string) => void;
  onGenerate: (description: string) => Promise<void>;
  generatedPattern: string;
  error?: string | null;
  isGenerating?: boolean;
  disabled?: boolean;
  placeholder: string;
  helpText: string;
}

const RegexField = React.memo(function RegexField({
  title,
  description,
  onDescriptionChange,
  onGenerate,
  generatedPattern,
  error,
  isGenerating = false,
  disabled = false,
  placeholder,
  helpText,
}: RegexFieldProps) {
  return (
    <div className="flex flex-col gap-3 p-4 border rounded-xl bg-card backdrop-blur-sm shadow-soft">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-foreground">{title}</h4>
      </div>
      
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">
          Description:
        </label>
        <Textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={placeholder}
          className="h-16 text-sm bg-background backdrop-blur-sm border rounded-lg resize-none shadow-soft"
          disabled={disabled}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onGenerate(description)}
            disabled={disabled || isGenerating || !description.trim()}
            className="flex items-center gap-1.5"
          >
            <Wand2 className="h-3.5 w-3.5" />
            {isGenerating ? "Generating..." : "Generate Pattern"}
          </Button>
        </div>
      </div>
      
      {generatedPattern && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            Generated Pattern:
          </label>
          <Textarea
            value={generatedPattern}
            readOnly
            className="h-12 font-mono text-xs bg-muted/80 backdrop-blur-sm border rounded-lg resize-none"
          />
        </div>
      )}
      
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground text-balance">{helpText}</p>
      )}
    </div>
  );
});

RegexField.displayName = "RegexField";

const RegexInput = React.memo(function RegexInput({
  titleRegex,
  contentRegex,
  negativeTitleRegex,
  negativeContentRegex,
  titleRegexDescription,
  contentRegexDescription,
  negativeTitleRegexDescription,
  negativeContentRegexDescription,
  onTitleRegexDescriptionChange,
  onContentRegexDescriptionChange,
  onNegativeTitleRegexDescriptionChange,
  onNegativeContentRegexDescriptionChange,
  onGenerateTitleRegex,
  onGenerateContentRegex,
  onGenerateNegativeTitleRegex,
  onGenerateNegativeContentRegex,
  titleRegexError,
  contentRegexError,
  negativeTitleRegexError,
  negativeContentRegexError,
  generatingFieldType,
  fieldRegexGenerationError,
  onClearPatterns,
  disabled = false,
}: RegexInputProps) {
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  
  const hasPatterns = titleRegex.trim() || contentRegex.trim() || 
                     negativeTitleRegex.trim() || negativeContentRegex.trim();
  const hasDescriptions = titleRegexDescription.trim() || contentRegexDescription.trim() ||
                         negativeTitleRegexDescription.trim() || negativeContentRegexDescription.trim();

  return (
    <div className="flex flex-col gap-4 bg-card/95 backdrop-blur-sm border rounded-xl p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-foreground">File Filters</h3>
        {(hasPatterns || hasDescriptions) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (onClearPatterns) onClearPatterns();
            }}
            className="text-destructive hover:text-destructive/80 flex items-center gap-1.5"
            disabled={disabled}
          >
            <X className="h-3.5 w-3.5" />
            Clear All
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RegexField
          title="Include by Path"
          description={titleRegexDescription}
          onDescriptionChange={onTitleRegexDescriptionChange}
          onGenerate={onGenerateTitleRegex}
          generatedPattern={titleRegex}
          error={titleRegexError || (generatingFieldType === 'title' ? fieldRegexGenerationError : null)}
          isGenerating={generatingFieldType === 'title'}
          disabled={disabled}
          placeholder="Describe which file paths to include..."
          helpText="Generate a regex to match file paths you want to include."
        />
        
        <RegexField
          title="Include by Content"
          description={contentRegexDescription}
          onDescriptionChange={onContentRegexDescriptionChange}
          onGenerate={onGenerateContentRegex}
          generatedPattern={contentRegex}
          error={contentRegexError || (generatingFieldType === 'content' ? fieldRegexGenerationError : null)}
          isGenerating={generatingFieldType === 'content'}
          disabled={disabled}
          placeholder="Describe what file content to look for..."
          helpText="Generate a regex to match file content you want to include."
        />
        
        <RegexField
          title="Exclude by Path"
          description={negativeTitleRegexDescription}
          onDescriptionChange={onNegativeTitleRegexDescriptionChange}
          onGenerate={onGenerateNegativeTitleRegex}
          generatedPattern={negativeTitleRegex}
          error={negativeTitleRegexError || (generatingFieldType === 'negativeTitle' ? fieldRegexGenerationError : null)}
          isGenerating={generatingFieldType === 'negativeTitle'}
          disabled={disabled}
          placeholder="Describe which file paths to exclude..."
          helpText="Generate a regex to match file paths you want to exclude."
        />
        
        <RegexField
          title="Exclude by Content"
          description={negativeContentRegexDescription}
          onDescriptionChange={onNegativeContentRegexDescriptionChange}
          onGenerate={onGenerateNegativeContentRegex}
          generatedPattern={negativeContentRegex}
          error={negativeContentRegexError || (generatingFieldType === 'negativeContent' ? fieldRegexGenerationError : null)}
          isGenerating={generatingFieldType === 'negativeContent'}
          disabled={disabled}
          placeholder="Describe what file content to avoid..."
          helpText="Generate a regex to match file content you want to exclude."
        />
      </div>
      
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="justify-start gap-2">
            Advanced Options
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <p className="text-xs text-muted-foreground">
            You can manually edit the generated regex patterns here if needed.
          </p>
          {/* TODO: Add manual regex editing fields here */}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

RegexInput.displayName = "RegexInput";

export default RegexInput;
