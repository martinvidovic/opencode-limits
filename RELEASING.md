# Releasing

opencode-limits is published manually by the maintainer. Releases use npm
staged publishing after the initial package publication. Hosted publishing,
publish tokens, and npm provenance are deliberately not part of this workflow.

## Release invariants

- Publish only from a clean release commit that is on the default branch and
  has been pushed to GitHub.
- Create and push an annotated `vX.Y.Z` tag for the exact release commit before
  its package version becomes public.
- Run the complete Quality Gate for every release candidate and stable release.
- Record the required OpenCode compatibility smoke tests for every publication.
- Apply the Promotion Gate before every stable release.
- Require interactive npm two-factor authentication and disallow publish
  tokens after the initial package publication.
- Store npm recovery codes outside the repository.

Manual publication does not produce npm provenance. npm provenance requires a
supported cloud-hosted publishing environment.

## Release toolchain

Staged publishing requires Node.js 22.14.0 or newer and npm 11.15.0 or newer.
These versions constrain the release operator only; contributors may use any
development package manager supported by the repository.

## Version policy

The first release line is `0.1.0` and begins with `0.1.0-rc.1`.

Before `1.0.0`:

- patches contain fixes only;
- every feature advances the minor version; and
- every breaking change advances the minor version and is labeled explicitly
  in the changelog.

Starting at `1.0.0`, breaking changes advance the major version according to
standard Semantic Versioning. Release candidates use `X.Y.Z-rc.N`, where `N`
starts at 1 for each target version and increases for every functional change.

Release candidates use the npm `next` dist-tag. Stable releases use `latest`.
Remove `next` after its release line is promoted, and recreate it when the next
prerelease line starts.

## Changelog and release notes

`CHANGELOG.md` is the canonical release history. Add user-visible changes under
`Unreleased`, then move them into the target version section during release
preparation. A GitHub Release reproduces that version section and adds the
required release evidence; it does not maintain separate release notes.

Create a GitHub Release for every published npm version. Mark release-candidate
releases as prereleases.

## Prepare a release

1. Start from the current default branch and confirm the worktree is clean.
2. Select the next version according to the version policy.
3. Update `package.json` and the lockfile without creating an automatic tag:
   `npm version <version> --no-git-tag-version`.
4. Finalize the matching `CHANGELOG.md` section.
5. Commit the release metadata as `release: v<version>` and push the commit to
   the default branch.
6. Run the aggregate local Quality Gate, including the build, tests, package
   contents, and installed-tarball smoke tests.
7. Complete the manual compatibility smoke tests against OpenCode `1.14.42`
   and the latest available v1 release.
8. For a stable release, complete the Promotion Gate and confirm the diff from
   the validated release-candidate tag contains no functional changes.

Do not publish from an uncommitted worktree, an unpushed commit, or a branch
that has not reached the default branch.

## Bootstrap publication

The first version cannot use npm staged publishing because the package does not
yet exist in the registry.

1. Prepare and verify `0.1.0-rc.1` using the normal release preparation steps.
2. Create the annotated tag with
   `git tag -a v0.1.0-rc.1 -m "v0.1.0-rc.1"`, then push it with
   `git push origin v0.1.0-rc.1`.
3. Publish interactively with 2FA:
   `npm publish --access public --tag next`.
4. Verify the public package version, exports, and `next` dist-tag.
5. In the npm package settings, select **Require two-factor authentication and
   disallow tokens**.
6. Create the matching GitHub prerelease from the changelog section and attach
   the required release evidence.

## Staged publication

Use staged publishing for every version after the bootstrap publication.

1. Stage the exact release commit with an explicit tag:
   `npm stage publish --tag next` for a release candidate or
   `npm stage publish --tag latest` for a stable release.
2. Inspect the staged metadata with `npm stage view <stage-id>`.
3. Download and inspect the registry-staged tarball with
   `npm stage download <stage-id>`.
4. Reject the stage with `npm stage reject <stage-id>` if any evidence differs
   from the verified release. Correct the problem and prepare a new release
   candidate when the correction is functional.
5. Create an annotated `v<version>` tag for the release commit and push that
   tag to `origin`.
6. Approve the stage interactively with 2FA:
   `npm stage approve <stage-id>`.
7. Verify the public version, package exports, and intended dist-tag.
8. Create the matching GitHub Release from the changelog section and record the
   release evidence.

## Stable promotion

Promote only the source that passed internal validation. Create a metadata-only
release commit that changes the prerelease version to `X.Y.Z`, updates the
lockfile, and finalizes the changelog. Any functional change requires a new
release candidate and another applicable validation pass.

After the stable stage is approved and `latest` is verified, remove the
prerelease channel with `npm dist-tag rm opencode-limits next`.

## Bad release recovery

Published npm versions are immutable and are never reused.

For a bad release candidate:

1. Move `next` to the previous known-good release candidate, or remove `next`
   when none exists.
2. Deprecate the bad version with a concise reason and replacement version when
   known.
3. Fix forward with the next `rc.N` version.

For a bad stable release:

1. Move `latest` to the previous known-good stable version, or remove it when
   no stable fallback exists.
2. Deprecate the bad version.
3. Fix forward with a new patch release.

Unpublish only for exceptional secret exposure, malware, legal requirements,
or registry-policy incidents. Unpublishing never permits reuse of the removed
version.
