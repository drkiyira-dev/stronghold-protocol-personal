# Contributing and AI attribution

This personal edition is maintained by **Dr.Kiriya**. OpenAI Codex is credited as an AI collaborator only for work it actually helped produce. Upstream authorship and third-party rights remain unchanged.

## Verified Codex identity

Verified on **2026-10-30**:

- [OpenAI's Codex GitHub account](https://github.com/codex) identifies itself as OpenAI's coding agent and links to OpenAI's Codex product page.
- The [official Codex attribution implementation at revision e4a3612](https://github.com/openai/codex/blob/e4a3612/codex-rs/core/src/commit_attribution.rs) specifies `Codex <noreply@openai.com>` as its default co-author value. This is a pinned source reference, not a claim that every current Codex client automatically appends it.
- The [official OpenAI Swarm commit 6af0b4c](https://github.com/openai/swarm/commit/6af0b4caf37dca4526dfd98e9fbd8ce36e7eeb22) uses that identity. GitHub's GraphQL `Commit.authors` response maps `noreply@openai.com` to the account `codex` (also mapping `codex@openai.com` to that account).
- GitHub documents the [co-author trailer format](https://docs.github.com/en/pull-requests/how-tos/commit-changes/creating-a-commit-with-multiple-authors) and [contributor eligibility](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-a-projects-contributors).

Use the verified trailer for new work with substantial Codex assistance:

```text
Co-authored-by: Codex <noreply@openai.com>
```

The normal author and committer remain the maintainer's actual identity. Do not replace them with a guessed bot identity. Leave human-only changes untagged, preserve other contributors' trailers, and include this trailer only once. No blanket commit hook is installed.

GitHub controls account association and the timing of contributor statistics. A recognized co-author on a commit is evidence of correct attribution; it is not a promise of immediate display in every Contributors view. Empty commits and rewritten history are not used to manufacture credit.

## Existing history

At the time of this audit, `02bf8c2` and `843bca3` were correctly linked to `drkiyira-dev`. The real feature commit `b2c09e9` had an automatically inferred local-machine identity and no linked GitHub author. It is preserved unchanged. Subsequent commits use the verified repository-local maintainer identity and, where applicable, the Codex co-author trailer.

## 中文说明

维护者为 **Dr.Kiriya**。已根据 OpenAI 官方源码、官方仓库提交及 GitHub API 确认：`Codex <noreply@openai.com>` 能关联到官方 `@codex` 账号。

后续实际由 Codex 协作完成的修改使用上述共同作者声明，主作者和提交者保留维护者真实身份；不会给纯人工提交自动加署名，不伪造账号或邮箱，也不通过空提交或改写历史制造贡献。GitHub 的 Contributors 显示和刷新时间由 GitHub 控制，已识别的共同作者与侧栏是否立即显示需要分别验证。

既有 `b2c09e9` 使用了本机自动推导身份且未关联 GitHub；该提交保持原样。`02bf8c2`、`843bca3` 已关联维护者账号。项目继续保留上游署名和第三方知识产权声明。
