import { Banner } from "@/components/Banner";
import { LocalWorkCard } from "@/components/LocalWorkCard";
import { StagingCard } from "@/components/StagingCard";
import { BackLink, Button, Card, Eyebrow, Page } from "@/components/ui";
import { Icon } from "@/components/ui";

/** Demo data: every status colour on the project page, side by side. Nothing here runs anything. */
export default function StatesPage() {
  const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const local = { path: "/Users/you/Sites/site", branch: "main", head: "ea92dd0abc", upstream: "origin/main", files: [], unpushed: [], behind: 0, pushCommand: "git push" };
  return (
    <Page>
      <BackLink href="/" label="All projects" />
      <h1 className="text-3xl font-extrabold">Status colours</h1>
      <Eyebrow>DEMO DATA · WHAT EACH COLOUR MEANS</Eyebrow>
      <Card className="flex flex-col gap-2 text-[15px]">
        <p><b className="text-[#0f6f6b]">Green</b> · done, nothing to do.</p>
        <p><b className="text-amber">Amber</b> · waiting on someone: changes not on live yet, behind main, not pushed, pinned.</p>
        <p><b className="text-[#b5651d]">Orange</b> · out of sync: something changed outside Stage Director.</p>
        <p><b className="text-red">Red</b> · failed or undone.</p>
        <p><b className="text-blue">Blue</b> · running now, and the main action button.</p>
        <p><b className="text-soft">Grey</b> · information only.</p>
      </Card>

      <h2 className="text-xl font-extrabold">Banners</h2>
      <div className="flex flex-col gap-3">
        <Banner kind="pending" title="Staging is ready to look at" detail="9 changes not on live site yet" action={{ label: "Open", href: "#" }} />
        <Banner kind="ready" title="Staging is ready to look at" detail="Live matches staging" />
        <Banner kind="busy" title="Ryan is updating staging" detail="Other buttons wait until it's done · about 1 min" />
        <Banner kind="sync" title="Out of sync" detail="Someone changed 1 file on the live site directly" />
        <Banner kind="undid" title="Safety net undid an update" detail="The login page stopped loading, so staging was put back" />
        <Banner kind="quiet" title="Quiet hours" detail="Live updates are paused until Monday 8 am" />
      </div>

      <h2 className="text-xl font-extrabold">On this computer</h2>
      <LocalWorkCard work={local} mainBranch="main" />
      <LocalWorkCard work={{ ...local, unpushed: [{ sha: "1234567abc", subject: "Fix the footer" }, { sha: "89abcdef12", subject: "New hub page" }] } as never} mainBranch="main" />

      <h2 className="text-xl font-extrabold">Staging card</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <StagingCard name="Staging" branch="main" running={null} behindBy={0} commit="ea92dd0" deployedAt={ago(17)} />
        <StagingCard name="Staging" branch="main" running={null} behindBy={3} commit="ea92dd0" deployedAt={ago(40)} />
        <StagingCard name="Staging" branch="main" running={{ commit: "abc1234", at: ago(0.1), by: "Ryan", source: "terminal", ref: "feature/x", behindBy: 0, onBranch: false }} behindBy={0} commit="ea92dd0" deployedAt={ago(17)} />
        <StagingCard name="Staging" branch="main" running={null} behindBy={0} commit="ea92dd0" deployedAt={ago(17)} pinned />
      </div>

      <h2 className="text-xl font-extrabold">Pills and buttons</h2>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2.5">
          <span className="rounded-full bg-chip px-3.5 py-2 text-[15px] font-bold text-soft">Staging updates by itself when the main branch changes</span>
        </div>
        <Button tone="blue" className="min-h-[72px] w-full rounded-[22px] text-[21px]">
          <Icon name="refresh" size={24} /> Update staging from the main branch (demo, does nothing)
        </Button>
      </Card>
    </Page>
  );
}
