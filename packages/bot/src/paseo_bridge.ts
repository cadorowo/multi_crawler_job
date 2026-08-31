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

const API = `https://api.telegram.org/bot${TOKEN}`;

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

async function sendMessage(chatId: number, text: string, replyToId?: number) {
  const MAX = 4096;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX) {
    chunks.push(text.slice(i, i + MAX));
  }
  for (const chunk of chunks) {
    await tgFetch('sendMessage', {
      chat_id: chatId,
      text: chunk,
      parse_mode: 'Markdown',
      ...(replyToId ? { reply_to_message_id: replyToId } : {}),
    });
  }
}

async function sendTyping(chatId: number) {
  await tgFetch('sendChatAction', { chat_id: chatId, action: 'typing' });
}

// ── AGY CLI call ─────────────────────────────────────────────────────────────
async function callAgy(prompt: string): Promise<string> {
  // Escape single quotes for shell safety
  const safePrompt = prompt.replace(/'/g, "'\\''");
  const cmd = `${AGY_BIN} --print '${safePrompt}' --dangerously-skip-permissions`;

  console.log(`\n🤖 Calling agy:\n   cwd: ${WORKSPACE}\n   cmd: ${cmd.slice(0, 120)}...`);

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
      msgId
    );
    await sendTyping(chatId);

    const result = await callAgy(text);

    console.log(`   ✅ AGY responded (${result.length} chars)`);

    // Prefix with a header
    const reply = `🤖 *AGY Response:*\n\n${result}`;
    await sendMessage(chatId, reply, msgId);
  } catch (err: any) {
    console.error(`   ❌ AGY error:`, err.message);
    await sendMessage(chatId, `❌ *Error running AGY:*\n\`${err.message}\``, msgId);
  } finally {
    pendingMessages.delete(chatId);
  }
}

// ── Polling loop ──────────────────────────────────────────────────────────────
async function poll() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(' 🌉 PASEO BRIDGE — Telegram ↔ AGY CLI');
  console.log(` 📁 Workspace: ${WORKSPACE}`);
  console.log(` 🤖 AGY binary: ${AGY_BIN}`);
  console.log(` 👥 Allowed users: ${ALLOWED_IDS.join(', ')}`);
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
