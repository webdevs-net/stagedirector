// Small helpers safe to use in both server and browser code.
export const RUN_STEPS = ["Checking what's changing", "Saving a backup", "Copying files", "Making sure the site still loads"];

export function repoToSlug(repo: string): string {
  return repo.replace("/", "~");
}
