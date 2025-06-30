"use client";

interface AudioLevelMeterProps {
  currentLevel: number;
  isActive: boolean;
  className?: string;
}

export function AudioLevelMeter({
  currentLevel,
  isActive,
  className = "",
}: AudioLevelMeterProps) {
  // Calculate level percentage for display
  const levelPercentage = Math.max(0, Math.min(100, currentLevel * 100));

  // Check if this is compact mode based on className
  const isCompact = className.includes('h-1') || className.includes('w-16');

  if (isCompact) {
    return (
      <div className={`relative rounded-full bg-muted overflow-hidden ${className}`}>
        <div
          className="h-full bg-gradient-to-r from-green-400 to-red-500 transition-transform duration-100 ease-out origin-left"
          style={{
            transform: isActive ? `scaleX(${currentLevel})` : 'scaleX(0)',
          }}
        />
      </div>
    );
  }

  // Full size version
  const isSilent = currentLevel < 0.01;
  
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="relative w-40 h-7 border border-border rounded-lg bg-background shadow-md overflow-hidden">
        <div 
          className="absolute inset-0.5 rounded-md"
          style={{
            background: isActive 
              ? 'linear-gradient(to right, #3B82F6 0%, #10B981 33%, #F59E0B 66%, #EF4444 100%)'
              : '#374151'
          }}
        >
          <div
            className="h-full bg-transparent transition-transform duration-100 ease-out origin-left"
            style={{
              transform: isActive ? `scaleX(${currentLevel})` : 'scaleX(0)',
              background: isActive 
                ? 'linear-gradient(to right, #3B82F6 0%, #10B981 33%, #F59E0B 66%, #EF4444 100%)'
                : 'transparent'
            }}
          />
        </div>
        
        {!isActive && (
          <div className="absolute inset-0.5 bg-gray-700 rounded-md" />
        )}
      </div>
      
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
            !isActive ? 'bg-gray-400' : isSilent ? 'bg-red-500' : 'bg-green-500'
          }`} />
          <span>
            {!isActive ? "Inactive" : isSilent ? "Silent" : "Active"}
          </span>
        </div>
        {isActive && (
          <span className="font-mono text-xs">
            {Math.round(levelPercentage)}%
          </span>
        )}
      </div>
    </div>
  );
}