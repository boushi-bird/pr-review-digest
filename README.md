# PRレビューコメント要約 (PR Review Digest)

このGitHub Actionは、プルリクエスト（PR）に投稿されたレビューコメントやIssueコメントを**OpenAI APIを利用して自動的に要約**し、その結果をPRの本文にチェックリストとして挿入・更新します。

レビューでの指摘事項や議論のポイントが一目でわかるようになり、対応漏れの防止やレビュー内容の迅速な把握に役立ちます。



## 📝 機能

* **コメントの自動収集**: PR内のレビューコメントを自動で収集します。
* **AIによる要約**: OpenAIのモデルを使い、収集したコメントを簡潔な箇条書きに要約します。
* **チェックリストの生成**: 要約結果をタスクリスト形式でPRの本文に追記または更新します。
* **更新の自動化**: アクションが再実行されるたびに、既存の要約リストを最新の内容で置き換えます。

***

## 使い方

### ワークフローのセットアップ

リポジトリの `.github/workflows/` ディレクトリに、以下のようなワークフローファイル（例: `summarize.yml`）を作成します。

**注意:** このアクションはPRの本文を更新するため、ワークフローに `pull-requests: write` 権限を付与する必要があります。

```yaml
name: Summarize PR Comments

on:
  pull_request_review:
  pull_request_review_comment:
    types: [edited, deleted]

jobs:
  summarize:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write # PRの本文を更新するために必要です
    steps:
      - name: Summarize PR Comments
        uses: boushi-bird/pr-review-digest@v1.0.0
        with:
          # 必須: OpenAIのAPIキーをSecretsに設定してください
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          # (オプション) 使用するOpenAIのモデルを指定
          openai-model: 'o3-mini'
          # その他オプションは `入力 (Inputs)` を参照してください
```

### OpenAI APIキーの設定

このアクションを使用するには、OpenAIのAPIキーが必要です。
1.  OpenAIでAPIキーを発行します。
2.  GitHubリポジトリの **Settings > Secrets and variables > Actions** を開きます。
3.  **New repository secret** をクリックし、`OPENAI_API_KEY` という名前でAPIキーを登録します。***

## 入力 (Inputs)

| パラメータ                 | 説明                                                                            | 必須    | デフォルト値                   |
| ------------------------ | ------------------------------------------------------------------------------ | ------- | ---------------------------- |
| `openai-api-key`         | OpenAI APIキー。リポジトリのSecretsに設定することを強く推奨します。                     | `true`  | -                           |
| `openai-model`           | 要約に使用するOpenAIのモデル名。                                                    | `false` | `o3-mini`                   |
| `summary-title`          | レビュー結果の要約セクションのタイトル。                                               | `false` | `**レビュー結果の要約:**`       |
| `comment-marker`         | PR本文内で、このアクションが生成した要約リストを識別するためのユニークなHTMLコメントマーカー。 | `false` | `<!-- PR Review Digest -->` |
| `include-issue-comments` | `true`に設定すると、レビューコメントに加えて通常のIssueコメントも要約の対象に含めます。      | `false` | `false`                     |
