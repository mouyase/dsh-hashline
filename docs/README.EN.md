# dsh-hashline

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) plugin that wraps the [hashline](https://github.com/quangdang46/hashline) line-addressed file editor as a native dsh tool named `hashline`.

> Chinese documentation: [README.md](../README.md)

## Features

- **Bundled binaries**: the npm package ships hashline binaries for every supported platform; works out of the box.
- **Native tool**: registers a dsh tool named `hashline`, ready to replace the default `str_replace_editor`.
- **Stable line-addressed editing**: reads emit `[path#HASH]` snapshot headers and per-line hashes; edits target line numbers instead of fragile string replacement.

## Install

```sh
dsh plugin --profile web add dsh-hashline
```

## Configure

```yaml
- insert:
    - id: dsh-hashline
      name: 'dsh-hashline'
      config:
        binaryPath: ''            # optional: override the hashline binary path
        maxOutputChars: 16000     # max tool output characters
        timeoutMs: 60000          # per-call timeout
```

## Replace the default editor

Disable the default editor and register hashline in a cordis patch:

```yaml
- id: tool-str-replace-editor
  disabled: true

- insert:
    - id: dsh-hashline
      name: 'dsh-hashline'
```

## Tool usage

Tool name: `hashline`. Arguments:

| Argument | Required for | Description |
|---|---|---|
| `command` | always | `read` / `patch` / `write` / `remove` / `rename` / `find_block` |
| `path` | always | Absolute file path |
| `patch` | patch | hashline patch text (SWAP/DEL/INS.*/SWAP.BLK/...) |
| `content` | write | Full file content to write |
| `target` | rename | Destination path |
| `anchor` | find_block | Line anchor such as `3` or `3:0e` |
| `force` | write | Overwrite an existing file |
| `dry_run` | patch | Preview the diff without writing |

Example patch text:

```text
SWAP 2:
+new second line

DEL 3

INS.TAIL:
+new trailing line
```

## Supported platforms

| Platform | Bundled binary |
|---|---|
| macOS arm64 | `hashline-macos-arm64` |
| macOS x64 | `hashline-macos-x64` |
| Linux x64 | `hashline-linux-x64` |
| Windows x64 | `hashline-win32-x64.exe` |

> No official release asset for Linux arm64 yet; install from source and set `binaryPath`.

## Binary source

Bundled binaries come from [hashline releases v0.8.6](https://github.com/quangdang46/hashline/releases/tag/v0.8.6).

## License

MIT
