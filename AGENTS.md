# Contribution attribution

The maintainer is Dr.Kiriya (`drkiyira-dev`). Preserve upstream authorship and third-party rights.

For new changes substantially authored or edited by OpenAI Codex, retain the maintainer's actual Git author/committer identity and add this trailer exactly once, separated from the message body by a blank line:

```text
Co-authored-by: Codex <noreply@openai.com>
```

Only add it when Codex actually contributed to the committed changes. Do not add it automatically to unrelated human-only commits. Do not invent an account or email, impersonate a GitHub App, create empty attribution commits, or amend/rebase/force-push existing history to add credit. Changes to this policy and documentation are real contributions and may carry the same co-author trailer.

Before committing, check the author identity with `git var GIT_AUTHOR_IDENT`. This repository's maintainer identity is `drkiyira-dev <289399102+drkiyira-dev@users.noreply.github.com>`. Use repository-local configuration; do not change the user's global identity.

Keep the English README primary and maintain its Chinese companion. Document PREP-only saves, self-hosted multiplayer requirements, and the distinction between local rule analysis and optional model advice accurately. See CONTRIBUTING.md for verified attribution references.

## Local acceptance resource limits

- Inventory browser windows before starting a test. Keep at most **four** browser windows open; prefer one test window and reuse it. Close only task-owned QA windows. If the limit cannot be met without interrupting the maintainer's windows, do not open another window.
- Run local tests serially. Do not overlap native browser play, headless browser suites, builds or engine simulations. Stop rendering or close task-owned test pages when finished.
- Monitor CPU and memory using available read-only system metrics. Pause testing when resource pressure or thermal throttling appears. If a counter is unavailable, state that limitation; never invent temperature or utilization figures.
