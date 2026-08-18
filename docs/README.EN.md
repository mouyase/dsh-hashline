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

The plugin registers 6 independent tools, each with strongly validated required arguments:

| Tool | Arguments | Description |
|---|---|---|
| `hashline_read` | `path` | Read a file with `[path#HASH]` snapshot header + numbered lines with per-line hashes |
| `hashline_patch` | `path`, `patch`, `dry_run?` | Apply a hashline patch (SWAP/DEL/INS.*/SWAP.BLK/...) |
| `hashline_write` | `path`, `content`, `force?` | Write full file content |
| `hashline_remove` | `path` | Delete a file |
| `hashline_rename` | `path`, `target` | Rename (move) a file |
| `hashline_find_block` | `path`, `anchor` | Find the enclosing syntactic block at an anchor |

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
