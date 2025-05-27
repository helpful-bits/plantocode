import SettingsForm from "@/app/components/settings/settings-form";
import { RequireProjectDirectory } from "@/app/components/with-project-directory";
import { useProject } from "@/contexts/project-context";

// Page metadata now handled via document title in Vite/React

export default function SettingsPage() {
  const { projectDirectory } = useProject();

  return (
    <div>
      {projectDirectory && (
        <div className="text-sm text-muted-foreground mb-4 text-balance">
          Configure AI model preferences specifically for the &apos;
          <span className="font-bold text-base text-foreground">{projectDirectory.split("/").pop()}</span>&apos; project. These settings
          override global defaults and apply to all sessions within this
          project.
        </div>
      )}
      
      <RequireProjectDirectory>
        <SettingsForm />
      </RequireProjectDirectory>
    </div>
  );
}
