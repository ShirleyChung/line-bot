const GITHUB_API_BASE = "https://api.github.com";

function parseRepoFullName(repoFullName) {
  const [owner, repo] = String(repoFullName || "").split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository name: ${repoFullName}`);
  }
  return { owner, repo };
}

function buildIssueBody({ workflow, request, estimate }) {
  return [
    "@codex Please implement this evolveEngine request in this repository and open a pull request for review.",
    "",
    "Codex task:",
    workflow.codexPrompt,
    "",
    "Repository context:",
    `- Repository: ${workflow.repository}`,
    `- Base branch: ${workflow.baseBranch}`,
    `- Suggested work branch: ${workflow.branch}`,
    `- PR title: ${workflow.prTitle}`,
    "",
    "Acceptance criteria:",
    "- Keep the change focused on the requested line-bot capability.",
    "- Add or update focused tests when useful.",
    "- Run the relevant checks and include the result in the PR description.",
    "- Open a draft PR against the configured base branch for human review.",
    "",
    "Trace:",
    `- Request ID: ${request.id}`,
    `- Estimated minutes: ${estimate.estimatedMinutes}`,
  ].join("\n");
}

export function buildCodexIssuePayload({ workflow, request, estimate }) {
  return {
    title: workflow.prTitle,
    body: buildIssueBody({ workflow, request, estimate }),
    labels: ["evolve-engine", "codex"],
  };
}

export async function createCodexIssueTrigger({
  githubToken,
  workflow,
  request,
  estimate,
  fetchImpl = fetch,
}) {
  const { owner, repo } = parseRepoFullName(workflow.repository);
  const payload = buildCodexIssuePayload({ workflow, request, estimate });
  const response = await fetchImpl(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${githubToken}`,
      "content-type": "application/json",
      "user-agent": "line-bot-evolve-engine",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const message = data?.message || `GitHub API returned ${response.status}`;
    throw new Error(`Failed to create Codex GitHub issue: ${message}`);
  }

  return {
    issueNumber: data.number,
    issueUrl: data.html_url,
    apiUrl: data.url,
  };
}
