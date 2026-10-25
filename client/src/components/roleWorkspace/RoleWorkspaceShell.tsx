import { Link } from "wouter";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, ChevronDown, MapPin } from "lucide-react";
import type { Language } from "@/lib/publicCopy";
import { roleWorkspaceCopy } from "@/lib/roleWorkspaceCopy";
import {
  officeDisplayLabel,
  splitRoleWorkspaceTasks,
  type RoleWorkspaceSubject,
  type RoleWorkspaceTask,
} from "@/lib/roleWorkspace";
import { packingSecondaryClass } from "@/components/packing/PackingPrimitives";

type Props = {
  language: Language;
  dir: "rtl" | "ltr";
  name?: string | null;
  subject: RoleWorkspaceSubject;
  tasks: RoleWorkspaceTask[];
  children?: React.ReactNode;
};

export default function RoleWorkspaceShell({ language, dir, name, subject, tasks, children }: Props) {
  const c = roleWorkspaceCopy[language];
  const { primary, more } = splitRoleWorkspaceTasks(tasks, 5);
  const roleKey = subject.role ?? "unassigned";
  const roleLabel = c.roles[roleKey];
  const office = officeDisplayLabel(subject.offices, language, subject.role === "admin");
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;
  return (
    <section className="mb-5 rounded-3xl border border-[#dce4e7] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[#092d50]">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#e8eff1] text-[#2d6380]"><BriefcaseBusiness size={19} /></span>
            <div className="min-w-0">
              <p className="truncate text-base font-black">{name || roleLabel}</p>
              <p className="truncate text-xs text-[#718088]">{roleLabel}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#52636e]">
            <span className="inline-flex items-center gap-1"><MapPin size={13} /> {office}</span>
            <span>{c.duty}: {roleLabel}</span>
          </div>
        </div>
        {tasks.length > 0 && (
          <nav className="flex max-w-full flex-wrap gap-2" aria-label={c.duty}>
            {primary.map(task => (
              <Link key={task.id} href={task.href} className={`${packingSecondaryClass} min-h-9 px-3 py-1.5 text-xs`}>
                {c.tasks[task.id]} <Arrow size={13} className="ms-1" />
              </Link>
            ))}
            {more.length > 0 && (
              <details className="relative">
                <summary className={`${packingSecondaryClass} min-h-9 cursor-pointer list-none px-3 py-1.5 text-xs`}>{c.more} <ChevronDown size={13} className="ms-1" /></summary>
                <div className="absolute end-0 top-11 z-20 grid min-w-52 gap-1 rounded-2xl border border-[#dce4e7] bg-white p-2 shadow-xl">
                  {more.map(task => <Link key={task.id} href={task.href} className="rounded-xl px-3 py-2 text-xs font-bold text-[#23445d] hover:bg-[#f1f5f4]">{c.tasks[task.id]}</Link>)}
                </div>
              </details>
            )}
          </nav>
        )}
      </div>
      {children}
    </section>
  );
}
