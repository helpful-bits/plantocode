import SettingsForm from "@/app/components/settings/settings-form";
import { RequireProjectDirectory } from "@/app/components/with-project-directory";

// Page metadata now handled via document title in Vite/React

export default function SettingsPage() {
  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold mb-8">Project Settings</h1>
      <RequireProjectDirectory>
        <SettingsForm />
      </RequireProjectDirectory>
    </div>
  );
}
