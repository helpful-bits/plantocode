import { Metadata } from "next";
import SettingsForm from "@/app/_components/settings/settings-form";
import { RequireProjectDirectory } from "@/components/with-project-directory";

export const metadata: Metadata = {
  title: "Settings | O1 Pro Flow",
  description: "Configure project-level model settings",
};

export default function SettingsPage() {
  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-6">Project Settings</h1>
      <RequireProjectDirectory>
        <SettingsForm />
      </RequireProjectDirectory>
    </div>
  );
}