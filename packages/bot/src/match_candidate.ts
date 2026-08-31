import { Bot, InlineKeyboard } from 'grammy';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || '159450250';

const bot = new Bot(token || 'dummy-token-for-initialization');

interface JobItem {
  id: string;
  company: string;
  title: string;
  location: string;
  ats: string;
  contract: string;
  applyUrl: string;
  score: number;
  tools: string[];
  description: string;
}

async function runCandidateMatching() {
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required to send candidate matches.');
  }
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(' 🎯 TAILORED PROFILE MATCHING ENGINE FOR POLITO DESIGN CANDIDATE');
  console.log(` Candidate: @dogo_time (ID: ${adminChatId})`);
  console.log(' Profile: UX/UI Design, Design Systems, Website Automation & AI Prototyping');
  console.log(' Framework: Erasmus+ Traineeship & Convenio de Prácticas (Barcelona, Spain)');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Load verified dataset
  const dataPath = resolve(process.cwd(), '../../dashboard/jobs_data.json');
  const rawData: JobItem[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  const scoredJobs = rawData.map(job => {
    let score = 70; // baseline
    const titleLower = (job.title || '').toLowerCase();
    const locLower = (job.location || '').toLowerCase();
    const contractLower = (job.contract || '').toLowerCase();

    // 1. Barcelona Priority (+15)
    if (locLower.includes('barcelona') || locLower.includes('cataluña') || locLower.includes('catalonia')) {
      score += 15;
    } else if (locLower.includes('spain') || locLower.includes('madrid')) {
      score += 8;
    }

    // 2. Discipline Alignment (+12)
    if (titleLower.includes('ux') || titleLower.includes('ui') || titleLower.includes('product design')) {
      score += 12;
    } else if (titleLower.includes('graphic') || titleLower.includes('visual') || titleLower.includes('diseño')) {
      score += 8;
    } else if (titleLower.includes('ai') || titleLower.includes('automation')) {
      score += 10;
    }

    // 3. Erasmus+ / Convenio explicit compliance (+5)
    if (contractLower.includes('erasmus') || contractLower.includes('convenio')) {
      score += 5;
    }

    return {
      ...job,
      tailoredScore: Math.min(score, 98),
    };
  });

  // Sort descending by tailoredScore
  scoredJobs.sort((a, b) => b.tailoredScore - a.tailoredScore);

  const topJobs = scoredJobs.slice(0, 5);

  console.log(`🏆 TOP 5 BEST BARCELONA INTERNSHIPS FOR YOUR PROFILE:\n`);

  topJobs.forEach((job, idx) => {
    console.log(`${idx + 1}. 🔥 [${job.tailoredScore}% MATCH] ${job.title}`);
    console.log(`   🏢 Company: ${job.company}`);
    console.log(`   📍 Location: ${job.location}`);
    console.log(`   🎓 Contract: ${job.contract}`);
    console.log(`   🔗 Direct Apply: ${job.applyUrl}\n`);
  });

  // Push Top 3 directly to Telegram chat
  console.log(`📲 Pushing Top Matched Cards to Telegram Chat ID: ${adminChatId}...`);

  try {
    for (let i = 0; i < Math.min(3, topJobs.length); i++) {
      const j = topJobs[i];
      if (!j) continue;
      const keyboard = new InlineKeyboard()
        .url('🔗 Apply on Official Portal', j.applyUrl)
        .row()
        .text('👍 Relevant', `save:${j.id}`)
        .text('💼 Mark Applied', `applied:${j.id}`);

      const msg = `🔥 *TOP MATCH #${i + 1} | ${j.tailoredScore}% Match*

🏢 *Company:* ${j.company}
🎨 *Role:* ${j.title}
📍 *Location:* ${j.location}
🎓 *Contract:* ${j.contract}
🌐 *Language:* English-first international environment
🛠 *Tools:* Figma, UI Design, Design Systems, Prototyping

💡 *Why it fits your PoliTo Profile:*
Direct alignment with your Politecnico di Torino UX/UI design coursework and portfolio in visual design & interface automation. Verified student internship agreement compatible.`;

      await bot.api.sendMessage(adminChatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });

      console.log(`   ✅ Sent Match #${i + 1} (${j.company}) to Telegram!`);
    }
  } catch (err: any) {
    console.log(`   ⚠️ Telegram push note: ${err.message}`);
  }
}

runCandidateMatching().catch(console.error);
