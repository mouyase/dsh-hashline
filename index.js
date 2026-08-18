// dsh-hashline — 把 hashline 行寻址编辑器封装为 dsh 原生工具。
//
// 内嵌 hashline 二进制（bin/），npm 安装后即可直接调用，无需系统安装。
// 工具名：hashline
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

const COMMANDS = ['read', 'patch', 'write', 'remove', 'rename', 'find_block']

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

function buildArgs(args) {
  switch (args.command) {
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
      throw new Error(`dsh-hashline: unknown command ${args.command}`)
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

async function executeHashline(args, exec, config) {
  const binary = resolveBinary(config)
  const cliArgs = buildArgs(args)
  const stdinText = args.command === 'patch' ? (args.patch ?? '') : null
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

function apply(ctx, config) {
  ctx.tools.register(defineTool({
    name: 'hashline',
    description:
      'Line-addressed file editor backed by the hashline CLI. ' +
      'Use `read` to read a file with stable line anchors, then `patch` to edit it with SWAP/DEL/INS operations keyed by line numbers. ' +
      'Commands: read, patch, write, remove, rename, find_block.',
    parameters: {
      command: {
        type: 'string',
        required: true,
        description: `One of: ${COMMANDS.join(', ')}`,
      },
      path: {
        type: 'string',
        required: true,
        description: 'Absolute path of the file to operate on.',
      },
      patch: {
        type: 'string',
        description: 'For patch: the hashline patch text (SWAP/DEL/INS.*/SWAP.BLK/...).',
      },
      content: {
        type: 'string',
        description: 'For write: the full file content to write.',
      },
      target: {
        type: 'string',
        description: 'For rename: the destination path.',
      },
      anchor: {
        type: 'string',
        description: 'For find_block: a line anchor like "3" or "3:0e".',
      },
      force: {
        type: 'boolean',
        description: 'For write: overwrite an existing file.',
      },
      dry_run: {
        type: 'boolean',
        description: 'For patch: preview the diff without writing.',
      },
    },
    output,
    timeoutMs: config.timeoutMs,
    isConcurrencySafe: () => true,
    execute: (args, exec) => executeHashline(args, exec, config),
  }))
  process.stderr.write('[dsh-hashline] registered tool hashline\n')
}

export { Config, apply, inject, name }
