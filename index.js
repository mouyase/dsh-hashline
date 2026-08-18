// dsh-hashline — 把 hashline 行寻址编辑器封装为 dsh 原生工具。
//
// 内嵌 hashline 二进制（bin/），npm 安装后即可直接调用，无需系统安装。
// 注册 6 个工具：hashline_read / hashline_patch / hashline_write /
// hashline_remove / hashline_rename / hashline_find_block
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'

const name = 'dsh-hashline'
const inject = ['tools']

const DEFAULT_MAX_OUTPUT_CHARS = 16000
const DEFAULT_TIMEOUT_MS = 60000

const Config = z.object({
  binaryPath: z.string().default(''),
  maxOutputChars: z.number().default(DEFAULT_MAX_OUTPUT_CHARS),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS),
})

function platformBinaryName(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'hashline-macos-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'hashline-macos-x64'
  if (platform === 'linux' && arch === 'x64') return 'hashline-linux-x64'
  if (platform === 'win32' && arch === 'x64') return 'hashline-win32-x64.exe'
  return null
}

function resolveBinary(config) {
  if (config.binaryPath) {
    if (!existsSync(config.binaryPath)) {
      throw new Error(`dsh-hashline: binaryPath not found: ${config.binaryPath}`)
    }
    return config.binaryPath
  }
  const binaryName = platformBinaryName(process.platform, process.arch)
  if (binaryName === null) {
    throw new Error(
      `dsh-hashline: no bundled binary for ${process.platform}/${process.arch}; ` +
      'install hashline from source and set binaryPath, or add the binary to bin/',
    )
  }
  const bundled = fileURLToPath(new URL(`./bin/${binaryName}`, import.meta.url))
  if (!existsSync(bundled)) {
    throw new Error(`dsh-hashline: bundled binary missing: ${bundled}`)
  }
  return bundled
}

function buildArgs(command, args) {
  switch (command) {
    case 'read':
      return ['read', args.path]
    case 'patch':
      return ['patch', args.path, '-', ...(args.dry_run ? ['--dry-run'] : [])]
    case 'write':
      return ['write', args.path, args.content ?? '', ...(args.force ? ['--force'] : [])]
    case 'remove':
      return ['remove', args.path]
    case 'rename':
      return ['rename', args.path, args.target ?? '']
    case 'find_block':
      return ['find-block', args.path, args.anchor ?? '']
    default:
      throw new Error(`dsh-hashline: unknown command ${command}`)
  }
}

function runBinary(binary, args, stdinText, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      signal,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      reject(new Error(`dsh-hashline: failed to spawn ${binary}: ${String(error)}`))
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        const detail = stderr.trim() || `exit code ${code}`
        reject(new Error(`dsh-hashline: ${args[0]} failed: ${detail}`))
      }
    })
    if (stdinText !== null && stdinText !== undefined) {
      child.stdin.write(stdinText)
    }
    child.stdin.end()
    if (timeoutMs > 0) {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
      }, timeoutMs)
      child.on('close', () => clearTimeout(timer))
    }
  })
}

function truncate(text, maxChars) {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n... [truncated, ${text.length - maxChars} more chars]`
}

async function executeCommand(command, args, exec, config) {
  const binary = resolveBinary(config)
  const cliArgs = buildArgs(command, args)
  const stdinText = command === 'patch' ? (args.patch ?? '') : null
  const result = await runBinary(binary, cliArgs, stdinText, exec.signal, config.timeoutMs)
  const output = truncate(result.stdout, config.maxOutputChars)
  const stderr = result.stderr ? truncate(result.stderr, config.maxOutputChars) : ''
  return stderr ? { output, stderr } : { output }
}

const output = {
  schema: {
    type: 'object',
    properties: {
      output: { type: 'string', required: true },
      stderr: { type: 'string' },
    },
    additionalProperties: false,
  },
  render(_args, value) {
    return [{ type: 'text', text: value.output }]
  },
}

const PATH_PARAM = {
  type: 'string',
  required: true,
  description: 'Absolute path of the file to operate on.',
}

function registerTool(ctx, config, toolName, description, parameters, command) {
  ctx.tools.register(defineTool({
    name: toolName,
    description,
    parameters,
    output,
    timeoutMs: config.timeoutMs,
    isConcurrencySafe: () => true,
    execute: (args, exec) => executeCommand(command, args, exec, config),
  }))
}

function apply(ctx, config) {
  registerTool(ctx, config, 'hashline_read',
    'Read a file with hashline snapshot format: [path#HASH] header + numbered lines with per-line hashes. Use before editing to get stable line anchors.',
    { path: PATH_PARAM },
    'read')

  registerTool(ctx, config, 'hashline_patch',
    'Apply a hashline patch to a file. Patch operations: SWAP N(:..M), DEL N(:..M), INS.PRE N, INS.POST N, INS.HEAD, INS.TAIL, SWAP.BLK N, DEL.BLK N, INS.BLK.POST N. Each operation line starts with the op, followed by lines prefixed with "+".',
    {
      path: PATH_PARAM,
      patch: {
        type: 'string',
        required: true,
        description: 'The hashline patch text, e.g. "SWAP 2:\\n+new second line".',
      },
      dry_run: {
        type: 'boolean',
        description: 'Preview the diff without writing.',
      },
    },
    'patch')

  registerTool(ctx, config, 'hashline_write',
    'Write full content to a file. Creates a new file, or overwrites an existing file when force is true.',
    {
      path: PATH_PARAM,
      content: {
        type: 'string',
        required: true,
        description: 'The full file content to write.',
      },
      force: {
        type: 'boolean',
        description: 'Overwrite the file if it already exists.',
      },
    },
    'write')

  registerTool(ctx, config, 'hashline_remove',
    'Delete a file entirely.',
    { path: PATH_PARAM },
    'remove')

  registerTool(ctx, config, 'hashline_rename',
    'Rename (move) a file.',
    {
      path: PATH_PARAM,
      target: {
        type: 'string',
        required: true,
        description: 'Destination path.',
      },
    },
    'rename')

  registerTool(ctx, config, 'hashline_find_block',
    'Find the enclosing syntactic block (brace/indent/ruby) around a line anchor.',
    {
      path: PATH_PARAM,
      anchor: {
        type: 'string',
        required: true,
        description: 'Line anchor like "3" or "3:0e".',
      },
    },
    'find_block')

  process.stderr.write('[dsh-hashline] registered 6 tools: hashline_read/patch/write/remove/rename/find_block\n')
}

export { Config, apply, inject, name }
