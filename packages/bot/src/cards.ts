import { InlineKeyboard } from 'grammy';

export interface AlertCardParams {
  jobId: string;
  title: string;
  companyName: string;
  location: string;
  workplaceType: string;
  score: number;
  domainFit: string;
  isUniversity: boolean;
  acceptsErasmus: boolean;
  language: string;
  keyTasks: string[];
  matchingTools: string[];
  summary: string;
  applyUrl: string;
  isApplied?: boolean;
  appliedDate?: string;
}

export interface DeepBreakdownParams {
  jobId: string;
  title: string;
  companyName: string;
  location: string;
  score: number;
  domainFit: string;
  isUniversity: boolean;
  acceptsErasmus: boolean;
  language: string;
  matchingTools: string[];
  missingTools: string[];
  keyTasks: string[];
  fitReasoning: string;
  companyDistrict?: string;
  companyTier?: number;
  salaryRaw?: string;
  applyUrl: string;
  isApplied?: boolean;
}

export function createAlertCard(params: AlertCardParams): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const scoreEmoji = params.score >= 80 ? '🔥' : params.score >= 65 ? '✨' : '💡';
  const domainLabel = params.domainFit.replace(/_/g, ' ').toUpperCase();

  const universityBadge = params.isUniversity
    ? '🎓 Convenio de Prácticas'
    : '💼 Direct Internship';
  const erasmusBadge = params.acceptsErasmus ? '🇪🇺 Erasmus+ Friendly' : '';

  const toolsText =
    params.matchingTools.length > 0 ? params.matchingTools.join(', ') : 'Tech & Design Tools';

  const tasksText = params.keyTasks.slice(0, 3).map((t) => `• ${t}`).join('\n');

  const appliedBanner = params.isApplied
    ? `\n✅ *Status: Applied on ${params.appliedDate || 'recently'}*\n`
    : '';

  const text = `${scoreEmoji} *${params.title}*
🏢 *${params.companyName}* | 📍 _${params.location}_ (${params.workplaceType})
🎯 *Match Score:* ${params.score}% • _${domainLabel}_
${appliedBanner}
${universityBadge} ${erasmusBadge ? `| ${erasmusBadge}` : ''}
🗣 *Language:* ${params.language.toUpperCase()}

📋 *Key Responsibilities:*
${tasksText}

🛠 *Matching Tools:* ${toolsText}
💬 *Why it fits:* ${params.summary}`;

  const keyboard = new InlineKeyboard()
    .text('📋 Deep Breakdown', `deep_breakdown:${params.jobId}`)
    .url('🔗 Apply Directly', params.applyUrl)
    .row()
    .text('👍 Relevant', `thumbs_up:${params.jobId}`)
    .text('👎 Irrelevant', `thumbs_down:${params.jobId}`)
    .row();

  if (params.isApplied) {
    keyboard.text('✅ Applied', `applied_info:${params.jobId}`);
  } else {
    keyboard.text('💼 Mark Applied', `applied:${params.jobId}`);
  }
  keyboard.text('❌ Dismiss', `dismiss:${params.jobId}`);

  return { text, keyboard };
}

export function createDeepBreakdownCard(params: DeepBreakdownParams): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const domainLabel = params.domainFit.replace(/_/g, ' ').toUpperCase();
  const tasksText = params.keyTasks.map((t) => `• ${t}`).join('\n');

  const matchingText =
    params.matchingTools.length > 0 ? params.matchingTools.join(', ') : 'None specified';
  const missingText =
    params.missingTools.length > 0 ? params.missingTools.join(', ') : 'None';

  const tierText = params.companyTier === 1 ? 'Tier 1 Unicorn/Leader' : 'High-growth Tech Scaleup';
  const districtText = params.companyDistrict || 'Barcelona Tech Hub';

  const text = `📊 *Deep Match Breakdown: ${params.title}*
🏢 *${params.companyName}* (${tierText} - ${districtText})
🎯 *Match Score:* ${params.score}% • _${domainLabel}_

🎓 *Student Status:* ${params.isUniversity ? 'Requires / Accepts University Agreement' : 'Open Direct Internship'}
🇪🇺 *Erasmus+ Support:* ${params.acceptsErasmus ? 'Yes, EU traineeship grant eligible' : 'Standard local hiring'}
🗣 *Working Language:* ${params.language.toUpperCase()}
${params.salaryRaw ? `💰 *Compensation:* ${params.salaryRaw}\n` : ''}
🛠 *Matching Skills & Tools:*
✅ ${matchingText}

⚠️ *Missing / Nice-to-Have Tools:*
${missingText}

📋 *Detailed Tasks:*
${tasksText}

💡 *AI Match Rationale:*
${params.fitReasoning}`;

  const keyboard = new InlineKeyboard()
    .url('🔗 Apply Directly', params.applyUrl)
    .row()
    .text('⬅️ Back to Summary', `back_to_summary:${params.jobId}`);

  if (!params.isApplied) {
    keyboard.text('💼 Mark Applied', `applied:${params.jobId}`);
  }

  return { text, keyboard };
}
