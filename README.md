# mermaid-validator-api

Mermaid 语法验证 API，使用 [mermaid.js](https://mermaid.js.org/) 在本地解析校验，无需依赖外部服务。

基于 [Hono](https://hono.dev/) 构建，支持部署到 [Vercel](https://vercel.com/)。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffl0w1nd%2Fmermaid-validator-api)

## API

部署到 Vercel 后，所有端点位于 `/api` 路径下。本地开发时位于根路径。

### `GET /health`

健康检查。

```json
{ "ok": true, "service": "mermaid-validator-api" }
```

### `POST /validate`

验证单个 Mermaid 图表。支持传入原始代码或 `` ```mermaid ``` `` 代码块。

**请求：**

```json
{ "id": "optional-id", "code": "graph TD; A-->B" }
```

**响应：**

```json
{ "id": "optional-id", "valid": true, "error": null }
```

### `POST /validate/batch`

批量验证，最多 200 条。

**请求：**

```json
{
  "items": [
    { "id": "1", "code": "graph TD; A-->B" },
    { "id": "2", "code": "invalid code" }
  ]
}
```

**响应：**

```json
{
  "ok": true,
  "count": 2,
  "invalidCount": 1,
  "results": [
    { "id": "1", "valid": true, "error": null },
    { "id": "2", "valid": false, "error": "No diagram type detected..." }
  ]
}
```

## 开发

```bash
pnpm install
pnpm dev       # 启动开发服务器 (localhost:3000)
pnpm test      # 运行测试
pnpm typecheck # 类型检查
```

## 部署

项目通过 `api/[...route].ts` 配置 Vercel Serverless Function，直接连接 Vercel 即可部署。

## License

MIT
