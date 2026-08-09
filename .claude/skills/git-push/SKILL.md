---
name: git-push
description: "Push changes to both OpusFesta remotes. Use when the user says 'push', 'push changes', 'push to remote', or 'push to both repos'."
---

# Git Push to Remotes

## Remotes

| Remote | Repository |
|--------|------------|
| `origin` | OpusFesta-Company-Ltd/OpusFesta |
| `borismassesa` | borismassesa/opusfesta |

The fork remote is named `borismassesa`, not `boris` — `git push boris <branch>` fails with
"'boris' does not appear to be a git repository". Run `git remote -v` if a push is rejected for
an unknown remote.

## Process

1. **Verify clean state and branch:**
   ```bash
   git status
   git branch --show-current
   ```

2. **Check for unpushed commits:**
   ```bash
   git log origin/{branch}..HEAD --oneline 2>/dev/null || echo "No upstream yet"
   ```

3. **Push to origin** (primary — sets upstream tracking):
   ```bash
   git push -u origin OF-MPS-0003
   ```

4. **Push to borismassesa** (backup fork):
   ```bash
   git push borismassesa OF-MPS-0003
   ```

5. **Report** success/failure for each remote

## Rules

- **Never force push** — no `--force`, `-f`, or `--force-with-lease`
- **Never push directly to main** — only push feature branches
- Use `-u` flag on first push to `origin` to set upstream tracking
- Confirm branch name before pushing
- If push is rejected (behind remote), pull and resolve first:
  ```bash
  git pull --rebase origin OF-MPS-0003
  ```
- Always push to both remotes unless one explicitly fails
