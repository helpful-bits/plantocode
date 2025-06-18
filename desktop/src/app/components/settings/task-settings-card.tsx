"use client";

import { Card, CardContent, CardHeader } from "../../../ui/card";

interface TaskSettingsCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export default function TaskSettingsCard({ title, description, children }: TaskSettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}