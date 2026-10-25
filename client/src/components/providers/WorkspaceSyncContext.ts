import { createContext, useContext } from "react";
import { autoSyncCoordinator, type AutoSyncCoordinator } from "@/lib/autoSync";

export const WorkspaceSyncContext =
  createContext<AutoSyncCoordinator>(autoSyncCoordinator);

export function useWorkspaceSyncCoordinator(): AutoSyncCoordinator {
  return useContext(WorkspaceSyncContext);
}
