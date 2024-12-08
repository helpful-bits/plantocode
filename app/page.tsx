"use server";

import { Suspense } from "react";
import { ApplyChangesForm } from "./_components/apply-changes-form";

export default async function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ApplyChangesForm />
    </Suspense>
  );
}
