# Maria's Place: wipe-then-push cutover

Two pipes stay separate:

| Pipe | What moves | Stage Director action |
|------|------------|------------------------|
| Code | git / rsync of theme, plugins, mu-plugins | Update staging → Put live |
| Data | Valuable live rows only (users, pages/posts + meta) | Copy live to staging (and later the reverse for cutover) |

`scripts/deploy.sh` never deletes obsolete plugins/themes on the host and never
moves WordPress data. **Copy live to staging** is one button and a *minimal*
sync: users, pages/posts (and their meta/terms), enough media to render — not
options, not a full DB dump, not a second “everything” button. Previewed lean
code and that valuable live slice must both land on purpose.

## Sequence (person-owned)

1. **Backup live** — Toolbox **Save a backup**, or UpdraftPlus / host panel. Do not skip.
2. **Copy live → staging** — Toolbox **Copy live to staging** (`tools.copyLiveToStaging`).
   Staging gets the valuable live slice (users + pages/posts Maria may have
   changed) so you can preview on `https://staging.mariasplace.com/`. Code on
   staging can already be lean.
3. **Preview** — walk the staging site (login, My Account, Contact, new registrations).
   Fix code on staging with normal deploys until it looks right **with live data**.
4. **Wipe obsolete live plugins/themes** — by hand on Hostinger (or SSH), after the
   backup. Deploy will not remove them; leaving them risks the lean stack fighting
   leftovers when you put code live.
5. **Put lean code live** — code owner: approve the staging commit, then **Put live**.
6. **Push the previewed data set live** — only when the owner asks. Same class of
   sync as step 2, destination live (project script or a one-shot). Not automatic.
7. **liveTodo leftovers** — Divi edits that existed only on staging, cache clear, smoke.

## Rules

- AI sessions and scripts may start **Copy live to staging** as a *request*; a person
  who may push staging OKs it. Nothing may approve or push **live** by itself.
- Pin staging before a long preview if you need to freeze deploys; unpin before copy-live
  or Update staging (both refuse while pinned).
- Never run wipe or live data push from this Stage Director repo against the real host
  without the owner's explicit OK.
