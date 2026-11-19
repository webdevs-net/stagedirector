import { notFound } from "next/navigation";
import { getProject, getViewer, type Viewer } from "@/lib/mock";

export async function loadProject(params: Promise<{ repo: string }>, searchParams?: Promise<Record<string, string | string[] | undefined>>) {
  const { repo } = await params;
  const sp = (await searchParams) ?? {};
  const project = await getProject(decodeURIComponent(repo));
  if (!project) notFound();
  let viewer: Viewer = await getViewer();
  // ?as=developer previews what a developer sees (UI only; real roles come from CODEOWNERS).
  if (sp.as === "developer") viewer = { ...viewer, role: "developer" };
  const base = `/p/${repo}`;
  const q = sp.as === "developer" ? "?as=developer" : "";
  return { project, viewer, base, q, sp };
}

export type PageProps = { params: Promise<{ repo: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
