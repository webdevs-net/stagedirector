import { notFound } from "next/navigation";
import { getProject, getViewerFor, type Viewer } from "@/lib/data";

export async function loadProject(params: Promise<{ repo: string }>, searchParams?: Promise<Record<string, string | string[] | undefined>>) {
  const { repo } = await params;
  const sp = (await searchParams) ?? {};
  const project = await getProject(decodeURIComponent(repo));
  if (!project) notFound();
  let viewer: Viewer = await getViewerFor(project.repo);
  const realRole = viewer.role;
  // ?as=developer previews what a developer sees (UI only; real roles come from CODEOWNERS).
  if (sp.as === "developer") viewer = { ...viewer, role: "developer" };
  const base = `/p/${repo}`;
  const q = sp.as === "developer" ? "?as=developer" : "";
  return { project, viewer, realRole, base, q, sp };
}

export type PageProps = { params: Promise<{ repo: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
