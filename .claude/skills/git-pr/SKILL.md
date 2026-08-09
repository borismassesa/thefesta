---
name: git-pr
description: "Create pull requests following OpusFesta conventions. Use when creating a PR, writing a PR, or when the user asks to summarize changes for a pull request."
---

# Pull Request Convention

## Full PR Workflow

1. **Detect current branch and base:**
   ```bash
   git branch --show-current          # e.g., OF-MPS-0003
   git log main..HEAD --oneline       # commits to include
   ```

2. **Gather change context:**
   ```bash
   git diff main...HEAD --stat        # files changed summary
   git diff main...HEAD               # full diff for analysis
   ```

3. **Check remote status:**
   ```bash
   git status                         # clean working tree?
   git log origin/OF-MPS-0003..HEAD   # unpushed commits?
   ```

4. **Push if needed** (to both remotes):
   ```bash
   git push -u origin OF-MPS-0003
   git push borismassesa OF-MPS-0003
   ```

5. **Create PR** using `gh pr create`

## Title Format

```
OF-MPS-0003: feat: add booking lifecycle management
```

Pattern: `{BRANCH-ID}: {type}: {description}`

- Extract ticket ID from branch name
- Use the same commit types (feat, fix, polish, refactor, etc.)
- Under 70 characters total

## PR Body Format

```bash
gh pr create --title "OF-MPS-0003: feat: add booking lifecycle management" --body "$(cat <<'EOF'
## Summary
- Add booking status transitions from intake to completion
- Implement deposit tracking with TZS currency support

## Changes
- `apps/studio/app/api/admin/bookings/[id]/status/route.ts` — status transition endpoint
- `apps/studio/app/portal/bookings/page.tsx` — booking list with filters
- `supabase/migrations/20260316_add_booking_status.sql` — new status enum

## Test plan
- [ ] Submit a new booking intake form
- [ ] Admin transitions booking through each status
- [ ] Verify deposit amount displays correctly in TZS
- [ ] Check mobile responsiveness of booking cards
EOF
)"
```

**Never add a Claude attribution footer** (`🤖 Generated with Claude Code`) or a
`Co-Authored-By: Claude` line to the PR body. The body ends with the test plan.

## Dual Remote Awareness

- PRs are created on `origin` (OpusFesta-Company-Ltd/OpusFesta)
- Always push to `origin` before creating PR
- Also push to `borismassesa` (borismassesa/opusfesta) as backup. The remote is named
  `borismassesa`, not `boris`. Run `git remote -v` if a push is rejected for an unknown remote.

## Rules

- Target `main` branch by default
- Push to remote before creating PR
- Include meaningful test plan with checkboxes
- List key files changed in the Changes section
- Analyze ALL commits on the branch, not just the latest
- No Claude attribution footer or `Co-Authored-By: Claude` line in the PR body
