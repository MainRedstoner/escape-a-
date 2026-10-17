# SAVE_API.md —— 本机存档服务契约（v1）

`server.py` 提供的一个**可选**本机服务：一个「一条 key → 一段不透明字节」的储物柜，外加静态文件托管。
本文件是它与前端之间唯一的契约。**改这里的任何一条，都要同步 `server.py`、`tools/test_save_server.py`，以及将来的前端 `src/save.js`。**

> 和存档**内容**格式无关：`format` / `version` / 字段结构都归前端（见 [PLAN.md](PLAN.md) §3.2）。
> 后端只认 key 和字节，前端改存档格式不需要动后端。

---

## 一、定位与边界

- **只服务单机单人**：默认绑 `127.0.0.1`，无鉴权、无多用户、无云同步。
- **不是运行前置**：没有后端时游戏必须完整可用（localStorage + 导出 / 导入存档文件），见 [AGENTS.md](AGENTS.md) 硬约束 3。
- **只探测 `http:`**：前端必须在 `location.protocol === "http:"` 时才请求 `/api/ping`。`file://` 下请求 `127.0.0.1` 属于跨源，且会引出「任意本地页面都能读写存档」的安全面，不做。

### 非目标（不要往这里加）

目录树、权限 / ACL、分片上传、专用二进制接口、服务端查询 / 搜索、云同步与冲突合并、多用户。
需要这么多能力时应该换方案，而不是把 `server.py` 养成自研 S3。

---

## 二、五条原则

1. **不透明**：请求体原样落盘，后端不解析 JSON、不认识任何游戏字段。
2. **key 白名单**：`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`，路径穿越在内核层面就不可能（key 不能含 `/`、`\`、`..` 开头）。
3. **原子写**：临时文件 → `flush` → `fsync` → `os.replace`，断电 / 进程被杀也不会留下半截存档。
4. **只增不改**：新需求走新路由或新字段；破坏性变更才把 `api` 主版本 +1。前端只要求 `api >= 1`。
5. **幂等**：`DELETE` 一个不存在的 key 也回 `204`。

---

## 三、路由

所有 `/api/*` 响应都是 JSON（`application/json; charset=utf-8`）且带 `Cache-Control: no-store`；blob 内容是原始字节（`application/octet-stream`）。

| 方法 | 路径 | 成功状态 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/ping` | 200 | 握手：版本与体积上限 |
| GET | `/api/blobs` | 200 | 列表：只有元信息，不返回内容 |
| GET | `/api/blobs/<key>` | 200 | 原始字节 + `ETag`；可带 `If-None-Match` |
| PUT | `/api/blobs/<key>` | 201（新建）/ 200（覆盖） | 原样写入；可带 `If-Match` |
| DELETE | `/api/blobs/<key>` | 204 | 幂等 |

### 3.1 `GET /api/ping`

```json
{ "api": 1, "maxBytes": 16777216, "app": "escape-a-div-save" }
```

- `api`：契约主版本。前端不满足 `api >= 1` 时视为后端不可用。
- `maxBytes`：单条 key 的请求体上限（字节）。前端在写入前自己检查，别把超大文件送上去。

### 3.2 `GET /api/blobs`

```json
{
  "items": [
    { "key": "save-1", "size": 2048, "mtime": 1730000000000, "etag": "\"2048-1730000000123456789\"" }
  ]
}
```

- 按 `key` 升序排列；空目录回 `{"items": []}`。
- `mtime` 是**毫秒**时间戳；`etag` 是该文件当前版本标识。
- **不含内容**：需要内容请逐个 `GET /api/blobs/<key>`。

### 3.3 `GET /api/blobs/<key>`

- 成功：`200`，body 为原始字节，响应头带 `ETag`。
- 带 `If-None-Match: <etag>` 且匹配：`304`，无 body。
- 不存在：`404`。

### 3.4 `PUT /api/blobs/<key>`

- 请求体：原始字节，**必须**带 `Content-Length`（缺失回 `411`）。
- 带 `If-Match: <etag>`（或 `*`）：当前 etag 不匹配时回 `409`，body 里带当前 `etag`，让前端提示玩家；不带 `If-Match` 则直接覆盖。
- 成功响应：

```json
{ "key": "save-1", "size": 2048, "etag": "\"2048-1730000000123456789\"", "created": true }
```

- 超过 `maxBytes`：`413`，连接随即关闭（不会读取请求体）。

### 3.5 `DELETE /api/blobs/<key>`

- 一律 `204`，无 body，无论 key 是否存在。

---

## 四、错误格式

所有 4xx / 5xx 都是 JSON：

```json
{ "error": "bad_key", "message": "key 只能由字母/数字/. _ - 组成" }
```

| `error` | 状态 | 触发条件 |
| --- | --- | --- |
| `bad_key` | 400 | key 不符合白名单 |
| `not_found` | 404 | key / 接口不存在 |
| `too_large` | 413 | 请求体超过 `maxBytes` |
| `etag_mismatch` | 409 | `If-Match` 与实际不符，body 附带当前 `etag` |
| `length_required` | 411 | PUT 缺少 `Content-Length` |
| `bad_length` | 400 | `Content-Length` 非法 |
| `incomplete_body` | 400 | 连接提前结束，请求体不完整 |
| `method_not_allowed` | 405 | 方法不支持 |

---

## 五、磁盘布局

```
saves/                    默认数据目录（--data-dir 可改，已在 .gitignore）
  save-1                  一条 key 一个文件，文件名即 key，内容为原始字节
  save-auto
  .save-1.tmp.<pid>.<tid> 写入过程中的临时文件；成功后 os.replace 掉
```

- 数据目录里的文件名必须匹配 key 白名单才出现在列表里，其它文件忽略。
- **存档别提交到仓库**；`saves/` 已在 `.gitignore`。

---

## 六、前端的义务（对应实现见 PLAN.md §3.1）

1. 全部接口按**异步**调用；`list()` 在启动时拉一次进内存，UI 渲染走缓存。
2. 启动探测：`http:` → `GET /api/ping` 成功且 `api >= 1` 才启用后端，否则回落 localStorage；探测失败**不阻塞**游戏。
3. 写入与读取都把整个信封（`format` / `version` / `payload`）当字节处理，后端不参与迁移。
4. 迁移**只在前端**：缺 `version` 的旧档按 `v0` 迁移；版本高于代码认识的，拒绝加载并提示，绝不改写原数据。
5. `409` 不是致命错误：提示玩家「存档已被其它窗口改动」，等其重试。

---

## 七、变更流程

- 新增路由 / 新增可选字段：直接加，`api` 不变，本文件与冒烟测试同步更新。
- 改现有语义（状态码、key 规则、上限含义）：`api` 主版本 +1，并在本文件写迁移说明。
- 任何改动都必须让 `python tools/test_save_server.py` 保持全绿。
