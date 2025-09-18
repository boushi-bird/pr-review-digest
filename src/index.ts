import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import * as https from "https";

async function fetchComments(
  octokit: InstanceType<typeof GitHub>,
  includeIssueComments: boolean,
  params: { owner: string; repo: string; prNumber: number },
) {
  const { owner, repo, prNumber } = params;
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: prNumber,
  });

  const reviewComments = (
    await Promise.all(
      reviews.map(async (review) => {
        const { data: comments } =
          await octokit.rest.pulls.listCommentsForReview({
            owner,
            repo,
            pull_number: prNumber,
            review_id: review.id,
          });
        return comments;
      }),
    )
  ).flat();

  if (!includeIssueComments) {
    return reviewComments;
  }
  // オプションが有効な場合は通常のコメントも取得
  const { data: issueComments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  });

  return [...reviewComments, ...issueComments];
}

type Comment = Awaited<ReturnType<typeof fetchComments>>[number];

async function generateSummary(
  apiKey: string,
  model: string,
  systemPrompt: string,
  comments: Comment[],
) {
  const filteredComments = comments.map((comment) => {
    if ("diff_hunk" in comment) {
      return {
        id: comment.id,
        body: comment.body,
        diff_hunk: comment.diff_hunk,
        path: comment.path,
        position: comment.position,
        original_position: comment.original_position,
        in_reply_to_id: comment.in_reply_to_id,
      };
    }
    return {
      id: comment.id,
      body: comment.body,
      diff_hunk: undefined,
      in_reply_to_id: undefined,
    };
  });
  const systemPromptWithExample = `${systemPrompt}

# Input Data
入力として、コメント情報のJSON配列が渡されます。各コメントオブジェクトの主要なキーは以下の通りです。
- \`id\`: コメントの一意の識別子です。
- \`body\`: コメントのテキスト内容です。レビュアーの意図がここに書かれています。
- \`path\`: コメントが付けられたファイルへのパスです。
- \`position\`: コメントが付けられた行番号です。
- \`original_position\`: コメントが付けられた元の行番号です。
- \`diff_hunk\`: コメントが関連するコードの差分です。コードの文脈を理解するために重要です。
- \`in_reply_to_id\`: このコメントが他のコメントへの返信であることを示します。このIDを辿ることで、一連の議論を把握できます。

# Output Format
最終的な出力は、\`results\`というキーを持つJSONオブジェクトにしてください。\`results\`の値は、生成されたTODOリストの各項目を要素とする文字列の配列です。

---
## Example
### Input Comments:
[
  { "id": 1, "body": "この関数名、もっと分かりやすい名前にしませんか？ \`calc\` とか。", "path": "src/utils.ts", "position": 10, "original_position": 10, "diff_hunk": "@@ -1,5 +1,5 @@\n-function calc(a, b) {\n+function calculate(a, b) {\n   return a + b;\n }" },
  { "id": 2, "body": "typo: \`messge\` -> \`message\`", "path": "src/main.ts", "position": 15, "original_position": 15, "diff_hunk": "@@ -10,7 +10,7 @@\n console.log(messge);\n" },
  { "id": 3, "body": "賛成です！それがいいと思います。", "path": "src/utils.ts", "in_reply_to_id": 1 }
]

### Expected Output (inside JSON string):
{
  "results": [
    "関数名をより分かりやすいものに修正することを検討してください（提案例: \`calc\`）。",
    "タイポを修正してください (\`messge\` → \`message\`)。"
  ]
}
`;

  const userPrompt = JSON.stringify(filteredComments);

  const data = JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content: systemPromptWithExample,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "summary",
        schema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              description: "要約されたコメントのリスト",
              items: {
                type: "string",
              },
            },
          },
          required: ["results"],
          additional_properties: false,
        },
      },
    },
  });

  const options = {
    hostname: "api.openai.com",
    port: 443,
    path: "/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  };

  const responseBody = await new Promise<string>((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(body);
        } else {
          reject(
            new Error(
              `OpenAI API returned status code ${res.statusCode}: ${body}`,
            ),
          );
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.write(data);
    req.end();
  });
  const openAiResponse = JSON.parse(responseBody) as {
    choices: { message: { content: string } }[];
  };
  const openAiResponseContent = openAiResponse.choices
    .map((choice) => choice.message.content)
    .join("");
  return JSON.parse(openAiResponseContent) as { results: string[] };
}

async function run() {
  try {
    const token = core.getInput("token", { required: true });
    const commentMarker = core.getInput("comment-marker");
    const includeIssueComments =
      (core.getInput("include-issue-comments") || "false").toUpperCase() ===
      "TRUE";
    const openaiApiKey = core.getInput("openai-api-key", { required: true });
    const openaiModel = core.getInput("openai-model", { required: true });
    const summaryTitle = core.getInput("summary-title");
    const systemPrompt = core.getInput("system-prompt");

    const octokit = github.getOctokit(token);

    const { owner, repo } = github.context.repo;
    const prNumber =
      github.context.payload.pull_request?.number ||
      github.context.payload.issue?.number;

    if (!prNumber) {
      core.setFailed(
        "このアクションはプルリクエストで実行する必要があります。",
      );
      return;
    }

    const comments = await fetchComments(octokit, includeIssueComments, {
      owner,
      repo,
      prNumber,
    });

    // OpenAIでコメントを要約
    const { results: summaryResults } = await generateSummary(
      openaiApiKey,
      openaiModel,
      systemPrompt,
      comments,
    );

    if (comments.length === 0) {
      core.info(
        `プルリクエスト #${prNumber} にはレビューコメントがありませんでした。`,
      );
      return;
    }

    const checkboxList = summaryResults.map((r) => `- [ ] ${r}`).join("\n");

    // --- プルリクエストの本文の取得と更新処理 ---
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const newContent = `${commentMarker}\n${summaryTitle}\n${checkboxList}\n${commentMarker}`;

    let updatedBody = pr.body || "";

    if (updatedBody.includes(commentMarker)) {
      const regex = new RegExp(
        `${commentMarker}[\\s\\S]*?${commentMarker}`,
        "g",
      );
      updatedBody = updatedBody.replace(regex, newContent);
    } else {
      updatedBody += `\n\n${newContent}`;
    }

    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      body: updatedBody,
    });

    core.info(
      `プルリクエスト #${prNumber} にレビューの要約を追加/更新しました。`,
    );
  } catch (error) {
    core.setFailed((error as Error).message);
  }
}

run();
