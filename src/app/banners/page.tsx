import { Banner } from "@/components/Banner";
import { BackLink, Eyebrow, Page } from "@/components/ui";

export default function BannersPage() {
  const mp = "/p/netdevs-net~mariasplace";
  return (
    <Page>
      <BackLink href="/" label="All projects" />
      <h1 className="text-3xl font-extrabold">Banners</h1>
      <Eyebrow>BANNERS AT THE TOP OF THE OVERVIEW</Eyebrow>
      <div className="flex flex-col gap-3">
        <Banner kind="busy" title="Ryan is updating staging" detail="Other buttons wait until it's done · about 1 min" action={{ label: "Watch", href: `${mp}/updating` }} />
        <Banner kind="sync" title="Out of sync" detail="Someone changed 1 file on the live site directly" action={{ label: "Look", href: `${mp}/toolbox#sync` }} />
        <Banner kind="undid" title="Safety net undid an update" detail="The login page stopped loading, so staging was put back" action={{ label: "Why?", href: `${mp}/history` }} />
        <Banner kind="quiet" title="Quiet hours" detail="Live updates are paused until Monday 8 am" />
        <Banner kind="ready" title="Staging is ready to look at" detail="Also sent by email · Alerts" action={{ label: "Open", href: "https://staging.mariasplace.com/" }} />
      </div>
    </Page>
  );
}
