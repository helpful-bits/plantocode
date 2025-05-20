import { lazy } from "react";

export const BackgroundJobsSidebar = lazy(() =>
  import("./components/background-jobs-sidebar/background-jobs-sidebar").then(
    (mod) => ({ default: mod.BackgroundJobsSidebar })
  )
);

export const Navigation = lazy(() =>
  import("./components/navigation").then((mod) => ({ default: mod.Navigation }))
);
