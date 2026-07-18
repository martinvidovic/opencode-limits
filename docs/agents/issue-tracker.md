# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`, also fetching labels when needed.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `gh issue edit <number> --remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; `gh` does this automatically when run inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests, so resolve ambiguous numbers with `gh pr view <number>` and fall back to `gh issue view <number>`.

## Skill operations

When a skill says to publish to the issue tracker, create a GitHub issue. When it says to fetch a ticket, run `gh issue view <number> --comments`.

## Wayfinding operations

The wayfinding map is one issue with child issues as tickets.

- **Map**: create one issue labelled `wayfinder:map` containing Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child ticket**: link an issue to the map as a GitHub sub-issue using `gh api`. If sub-issues are unavailable, add the child to a task list in the map and put `Part of #<map>` at the top of the child body.
- **Ticket labels**: apply exactly one of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- **Blocking**: use GitHub's native issue dependencies. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<blocked>/dependencies/blocked_by -F issue_id=<blocker-database-id>`. The database ID comes from `gh api repos/<owner>/<repo>/issues/<number> --jq .id`.
- **Fallback blocking**: if native dependencies are unavailable, add `Blocked by: #<number>` to the blocked ticket body.
- **Frontier**: open, unassigned child tickets with no open blockers. The first ticket in map order wins.
- **Claim**: run `gh issue edit <number> --add-assignee @me` before doing any ticket work.
- **Resolve**: post the answer as a comment, close the ticket, then append a one-line gist and named link to the map's Decisions so far.
