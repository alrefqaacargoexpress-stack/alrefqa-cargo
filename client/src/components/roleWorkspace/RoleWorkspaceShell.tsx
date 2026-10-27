import { BriefcaseBusiness, MapPin } from "lucide-react";
import type { Language } from "@/lib/publicCopy";
import { roleWorkspaceCopy } from "@/lib/roleWorkspaceCopy";
import {
  officeDisplayLabel,
  type RoleWorkspaceSubject,
  type RoleWorkspaceTask,
} from "@/lib/roleWorkspace";

type Props = {
  language: Language;
  dir: "rtl" | "ltr";
  name?: string | null;
  subject: RoleWorkspaceSubject;
  tasks?: RoleWorkspaceTask[];
  children?: React.ReactNode;
};

export default function RoleWorkspaceShell({
  language,
  dir,
  name,
  subject,
  children,
}: Props) {
  const c = roleWorkspaceCopy[language];
  const roleLabel = c.roles[subject.role ?? "unassigned"];
  const office = officeDisplayLabel(
    subject.offices,
    language,
    subject.role === "admin"
  );
  return (
    <section
      dir={dir}
      className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#dce4e7] pb-3 text-sm"
    >
      <div className="flex min-w-0 items-center gap-2">
        <BriefcaseBusiness size={17} className="shrink-0 text-[#b98528]" />
        <span className="max-w-48 truncate font-bold text-[#092d50]">
          {name || roleLabel}
        </span>
        <span className="rounded-md bg-[#e8eff1] px-2 py-1 text-xs text-[#31566c]">
          {roleLabel}
        </span>
      </div>
      <span className="flex items-center gap-1 text-xs text-[#52636e]">
        <MapPin size={13} />
        {office}
      </span>
      {children}
    </section>
  );
}
