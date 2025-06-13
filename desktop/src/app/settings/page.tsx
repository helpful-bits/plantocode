import SettingsTabs from "@/app/components/settings/settings-tabs";
import { RequireProjectDirectory } from "@/app/components/with-project-directory";
import { useProject } from "@/contexts/project-context";

// Page metadata now handled via document title in Vite/React

export default function SettingsPage() {
  const { projectDirectory } = useProject();

  return (
    <div>
      {projectDirectory && (
        <div className="text-sm text-muted-foreground mb-4 text-balance">
          Configure settings for the &apos;
          <span className="font-bold text-base text-foreground">{projectDirectory.split("/").pop()}</span>&apos; project. 
          Model settings and system prompts are customized per project.
        </div>
      )}
      
      <RequireProjectDirectory>
        <SettingsTabs />
      </RequireProjectDirectory>
    </div>
  );
}
