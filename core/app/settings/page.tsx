import { Metadata } from "next";
import SettingsForm from '@core/app/components/settings/settings-form';
import { RequireProjectDirectory } from '@core/components/with-project-directory';

export const metadata: Metadata = {
  title: "Settings | Vibe Manager",
  description: "Configure project-level model settings",
};

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