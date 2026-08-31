#!/usr/bin/env node
/**
 * paseo_bridge.ts — Telegram ↔ AGY CLI bridge
 *
 * Polls Telegram for new messages from whitelisted users,
 * forwards each message as a prompt to `agy --print`,
 * and replies with the full CLI output.
 *
 * Run: ./node_modules/.bin/tsx src/paseo_bridge.ts
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const execAsync = promisify(exec);

// ── Config ─────────────────────────────────────────────────────────────────
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8565693353:AAFw7xw2RuweoMVb047-gIjxxCrcDA_5w_s';
const ALLOWED_IDS = (process.env.ALLOWED_TELEGRAM_IDS || '159450250')
  .split(',')
  .map(s => s.trim());

// Path to the workspace agy should operate in (the project root)
const WORKSPACE = resolve(process.cwd(), '../../');
const AGY_BIN = process.env.AGY_BIN || 'agy';
const AGY_TIMEOUT_MS = 5 * 60 * 1000; // 5 min max per agy call

const CONV_ID_FILE = resolve(process.cwd(), '.bridge_conversation_id');
const API = `https://api.telegram.org/bot${TOKEN}`;

// ── Load or bootstrap the dedicated bridge conversation ID ───────────────────
//
// The bridge runs every Telegram message as a new TURN in the same dedicated
// agy conversation. This gives the agent:
//   • AGENTS.md context (loaded on session start from project root)
//   • Full memory of all prior Telegram turns across bridge restarts
//   • No bleed-in from other agy sessions (IDE, CLI, etc.)
//
let BRIDGE_CONV_ID: string | null = null;

function loadConvId(): string | null {
  try {
    const raw = fs.readFileSync(CONV_ID_FILE, 'utf-8').trim();
    return raw || null;
  } catch {
    return null;
  }
}

function saveConvId(id: string) {
  fs.writeFileSync(CONV_ID_FILE, id + '\n', 'utf-8');
}

// ── State ────────────────────────────────────────────────────────────────────
let lastUpdateId = 0;
const pendingMessages = new Map<number, boolean>(); // chatId → busy


// ── Telegram helpers ─────────────────────────────────────────────────────────
async function tgFetch(method: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<any>;
}

async function getUpdates() {
  return tgFetch('getUpdates', {
    offset: lastUpdateId + 1,
    timeout: 30, // long-polling seconds
    allowed_updates: ['message'],
  });
}

function formatForTelegram(text: string): string {
  let cleaned = text;
  // Convert standard markdown bold **word** to Telegram *word*
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  // Convert markdown headers ### Title to *Title*
  cleaned = cleaned.replace(/^#{1,6}\s*(.+)$/gm, '*$1*');
  // Strip internal local file URIs like [file.json](file:///Users/...) -> `file.json`
  cleaned = cleaned.replace(/\[([^\]]+)\]\(file:\/\/[^\)]+\)/g, '`$1`');
  return cleaned;
}

async function sendMessage(chatId: number, text: string, replyToId?: number, useMarkdown = true) {
  const MAX = 4096;
  const formatted = useMarkdown ? formatForTelegram(text) : text;
  const chunks: string[] = [];
  for (let i = 0; i < formatted.length; i += MAX) {
    chunks.push(formatted.slice(i, i + MAX));
  }
  for (const chunk of chunks) {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: chunk,
      ...(replyToId ? { reply_to_message_id: replyToId } : {}),
    };
    if (useMarkdown) {
      payload.parse_mode = 'Markdown';
    }
    const result = await tgFetch('sendMessage', payload);
    if (!result.ok && useMarkdown) {
      // Markdown failed — retry as plain text
      console.log(`   ⚠️ Markdown parse error, retrying as plain text: ${result.description}`);
      const plainPayload: Record<string, unknown> = {
        chat_id: chatId,
        text: chunk,
        ...(replyToId ? { reply_to_message_id: replyToId } : {}),
      };
      await tgFetch('sendMessage', plainPayload);
    }
  }
}

async function sendTyping(chatId: number) {
  await tgFetch('sendChatAction', { chat_id: chatId, action: 'typing' });
}

// ── AGY CLI call ─────────────────────────────────────────────────────────────
//
// Every Telegram message is a new turn in the DEDICATED bridge agy conversation
// identified by BRIDGE_CONV_ID (stored in packages/bot/.bridge_conversation_id).
// This gives the agent persistent memory across bridge restarts, isolated from
// other agy sessions (IDE, other CLI runs, etc.).
//
async function callAgy(prompt: string): Promise<string> {
  const safePrompt = prompt.replace(/'/g, "'\\''");

  // Use dedicated conversation ID if we have one, otherwise fall back to --continue
  const convFlag = BRIDGE_CONV_ID
    ? `--conversation ${BRIDGE_CONV_ID}`
    : '--continue';

  const cmd = `${AGY_BIN} --print '${safePrompt}' ${convFlag} --dangerously-skip-permissions`;

  console.log(`\n🤖 Calling agy [conv: ${BRIDGE_CONV_ID ?? 'latest'}]:\n   cmd: ${cmd.slice(0, 160)}...`);

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: WORKSPACE,
      timeout: AGY_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    const out = (stdout || '').trim();
    const err = (stderr || '').trim();
    return out || err || '_(no output)_';

  } catch (e: any) {
    const out = (e.stdout || '').trim();
    if (out) return out; // still return partial output
    throw e;
  }
}

// ── Message handler ───────────────────────────────────────────────────────────
async function handleMessage(msg: any) {
  const chatId: number = msg.chat.id;
  const userId: string = String(msg.from?.id ?? '');
  const text: string = msg.text || '';
  const msgId: number = msg.message_id;

  // Auth check
  if (!ALLOWED_IDS.includes(userId)) {
    console.log(`⛔ Blocked user ${userId} (not in allowlist)`);
    await sendMessage(chatId, '⛔ You are not authorised to use this bot.');
    return;
  }

  // Busy guard — one agy job per chat at a time
  if (pendingMessages.get(chatId)) {
    await sendMessage(chatId, '⏳ Still processing your previous request, please wait…', msgId);
    return;
  }

  if (!text.trim()) {
    await sendMessage(chatId, '💬 Send me a text message and I will forward it to the AGY agent.', msgId);
    return;
  }

  console.log(`\n📩 [${new Date().toISOString()}] Message from ${msg.from?.first_name} (${userId}):`);
  console.log(`   "${text}"`);

  pendingMessages.set(chatId, true);

  try {
    // Acknowledge immediately
    await sendMessage(
      chatId,
      `⚡ *Running your task with AGY…*\n\`\`\`\n${text.slice(0, 200)}\n\`\`\``,
      msgId,
      true
    );
    await sendTyping(chatId);

    const result = await callAgy(text);

    console.log(`   ✅ AGY responded (${result.length} chars)`);

    // Send directly without robot wrapper prefix
    await sendMessage(chatId, result, msgId, true);
  } catch (err: any) {
    console.error(`   ❌ AGY error:`, err.message);
    await sendMessage(chatId, `❌ *Error running AGY:*\n\`${err.message}\``, msgId, true);
  } finally {
    pendingMessages.delete(chatId);
  }
}

// ── Polling loop ──────────────────────────────────────────────────────────────
async function poll() {
  // Load the dedicated bridge conversation ID
  BRIDGE_CONV_ID = loadConvId();

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(' 🌉 PASEO BRIDGE — Telegram ↔ AGY CLI');
  console.log(` 📁 Workspace: ${WORKSPACE}`);
  console.log(` 🤖 AGY binary: ${AGY_BIN}`);
  console.log(` 👥 Allowed users: ${ALLOWED_IDS.join(', ')}`);
  if (BRIDGE_CONV_ID) {
    console.log(` 🧠 Bridge conversation: ${BRIDGE_CONV_ID}  (persistent, isolated)`);
  } else {
    console.log(` ⚠️  No bridge conversation ID found — will use --continue (run bootstrap first)`);
  }
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');
  console.log('🔄 Long-polling Telegram… (ctrl+C to stop)\n');


  while (true) {
    try {
      const data = await getUpdates();
      if (!data.ok) {
        console.error('Telegram API error:', data);
        await sleep(5000);
        continue;
      }

      for (const update of data.result ?? []) {
        lastUpdateId = update.update_id;
        if (update.message) {
          await handleMessage(update.message);
        }
      }
    } catch (err: any) {
      if (err.message?.includes('ETIMEOUT') || err.message?.includes('ECONNRESET')) {
        // Normal long-poll timeout, just retry
        continue;
      }
      console.error('Poll error:', err.message);
      await sleep(3000);
    }
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

poll();
