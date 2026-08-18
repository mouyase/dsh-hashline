# dsh-hashline

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）插件：把 [hashline](https://github.com/quangdang46/hashline) 行寻址文件编辑器封装为 dsh 原生工具 `hashline`。

> English documentation: [docs/README.EN.md](docs/README.EN.md)

## 特性

- **内嵌二进制**：npm 包自带 hashline 各平台二进制，安装即可用，无需系统安装。
- **原生工具**：注册为 dsh 工具 `hashline`，可直接替代默认的 `str_replace_editor`。
- **稳定行寻址编辑**：读取文件时带 `[path#HASH]` 快照头和行哈希，编辑基于行号，避免脆弱的字符串替换。

## 安装

```sh
dsh plugin --profile web add dsh-hashline
```

## 配置

```yaml
- insert:
    - id: dsh-hashline
      name: 'dsh-hashline'
      config:
        binaryPath: ''            # 可选：自定义 hashline 二进制路径
        maxOutputChars: 16000     # 工具输出最大字符数
        timeoutMs: 60000          # 单次调用超时
```

## 替代默认文件编辑器

在 cordis patch 中禁用默认编辑器并注册 hashline：

```yaml
- id: tool-str-replace-editor
  disabled: true

- insert:
    - id: dsh-hashline
      name: 'dsh-hashline'
```

## 工具用法

工具名 `hashline`，参数：

| 参数 | 必填 | 说明 |
|---|---|---|
| `command` | 是 | `read` / `patch` / `write` / `remove` / `rename` / `find_block` |
| `path` | 是 | 文件绝对路径 |
| `patch` | patch | hashline patch 文本（SWAP/DEL/INS.*/SWAP.BLK/...） |
| `content` | write | 写入的完整文件内容 |
| `target` | rename | 目标路径 |
| `anchor` | find_block | 行锚点，如 `3` 或 `3:0e` |
| `force` | write | 覆盖已存在文件 |
| `dry_run` | patch | 仅预览 diff，不写入 |

示例 patch 文本：

```text
SWAP 2:
+新的第二行

DEL 3

INS.TAIL:
+新增的末尾行
```

## 支持平台

| 平台 | 内嵌二进制 |
|---|---|
| macOS arm64 | `hashline-macos-arm64` |
| macOS x64 | `hashline-macos-x64` |
| Linux x64 | `hashline-linux-x64` |
| Windows x64 | `hashline-win32-x64.exe` |

> Linux arm64 暂无官方 release 资产，请从源码安装并通过 `binaryPath` 指定。

## 二进制来源

内嵌二进制来自 [hashline releases v0.8.6](https://github.com/quangdang46/hashline/releases/tag/v0.8.6)。

## 许可

MIT
