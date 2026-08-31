import { type Context } from 'grammy';
import pdfParse from 'pdf-parse';
import { db, users, eq } from '@bcn-intern-bot/db';
import {
  candidateExtractionSchema,
  getEmbedder,
  EmbedderService,
} from '@bcn-intern-bot/llm';
import { paseoBridge } from '../paseo_bridge.js';

export async function handleCvUpload(ctx: Context): Promise<void> {
  const document = ctx.message?.document;
  if (!document) {
    await ctx.reply('⚠️ Please attach a PDF document containing your CV.');
    return;
  }

  const fileName = document.file_name || 'document.pdf';
  const isPdf =
    document.mime_type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    await ctx.reply('⚠️ Only PDF documents are supported for CV extraction.');
    return;
  }

  const statusMsg = await ctx.reply('⏳ *Processing your CV...*\n1. Extracting text from PDF...', {
    parse_mode: 'Markdown',
  });

  try {
    // 1. Download PDF file
    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Parse text from PDF
    const pdfData = await pdfParse(buffer);
    const rawCvText = pdfData.text || '';

    if (rawCvText.trim().length < 50) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        '❌ Could not extract readable text from this PDF. Please ensure it is not a scanned image without OCR.'
      );
      return;
    }

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      '⏳ *Processing your CV...*\n1. Text extracted ✅\n2. Paseo is extracting skills, tools & roles...',
      { parse_mode: 'Markdown' }
    );

    // 3. AI extraction of candidate profile
    const candidateProfile = await paseoBridge.runStructured(
      candidateExtractionSchema,
      {
        prompt: `You are Paseo, an expert recruiter for internships and entry-level roles worldwide. Analyze this CV and extract the candidate's target roles, technical skills, design tools, development tools, languages, education, Erasmus eligibility, and a concise professional summary. Do not invent qualifications.\n\nCandidate CV Text:\n${rawCvText.slice(0, 8000)}`,
      }
    );

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      '⏳ *Processing your CV...*\n1. Text extracted ✅\n2. Profile structured ✅\n3. Preparing semantic matching profile...',
      { parse_mode: 'Markdown' }
    );

    // 4. Generate candidate vector embedding
    let embedding: number[] | undefined;
    if (process.env.OPENAI_API_KEY || process.env.OPENCODE_API_KEY) {
      const embedder = getEmbedder();
      const candidateEmbeddingText = EmbedderService.buildCandidateEmbeddingInput({
        targetRoles: candidateProfile.targetRoles,
        skills: candidateProfile.primarySkills,
        tools: [...candidateProfile.designTools, ...candidateProfile.developmentTools],
        bio: candidateProfile.summary,
      });
      embedding = await embedder.embedText(candidateEmbeddingText);
    }

    // 5. Upsert user in database
    const telegramId = String(ctx.from!.id);
    const userProfileData = {
      targetRoles:
        candidateProfile.targetRoles.length > 0
          ? candidateProfile.targetRoles
          : ['Software Engineer Intern', 'Product Design Intern'],
      disciplines: [],
      skills:
        candidateProfile.primarySkills.length > 0
          ? candidateProfile.primarySkills
          : ['TypeScript', 'React', 'Figma'],
      languages: candidateProfile.languages.map((l) => l.language),
      preferredLocations: [],
      contractTypes: candidateProfile.erasmusEligible ? ['Erasmus+'] : [],
      remotePreference: 'hybrid' as const,
      visaRequired: !candidateProfile.erasmusEligible,
      bio: candidateProfile.summary,
      resumeRawText: rawCvText.slice(0, 10000),
    };

    const existingUser = await db.query.users.findFirst({
      where: eq(users.telegramId, telegramId),
    });
    const persistedProfileData = existingUser
      ? {
          ...existingUser.profile,
          ...userProfileData,
          disciplines: existingUser.profile.disciplines || [],
          preferredLocations: existingUser.profile.preferredLocations || [],
          contractTypes:
            existingUser.profile.contractTypes?.length
              ? existingUser.profile.contractTypes
              : userProfileData.contractTypes,
          remotePreference: existingUser.profile.remotePreference || userProfileData.remotePreference,
        }
      : userProfileData;

    if (existingUser) {
      await db
        .update(users)
        .set({
          fullName: candidateProfile.fullName || existingUser.fullName,
          profile: persistedProfileData,
          embedding,
          updatedAt: new Date(),
        })
        .where(eq(users.telegramId, telegramId));
    } else {
      await db.insert(users).values({
        telegramId,
        telegramUsername: ctx.from?.username,
        telegramChatId: String(ctx.chat!.id),
        fullName: candidateProfile.fullName || ctx.from?.first_name || 'Candidate',
        profile: persistedProfileData,
        embedding,
      });
    }

    // 6. Build beautiful confirmation message
    const rolesText = persistedProfileData.targetRoles.map((r) => `• ${r}`).join('\n');
    const skillsText = persistedProfileData.skills.join(', ');
    const toolsText = [
      ...candidateProfile.designTools,
      ...candidateProfile.developmentTools,
    ].join(', ');
    const languagesText = candidateProfile.languages
      .map((l) => `${l.language} (${l.proficiency})`)
      .join(', ');

    const confirmationText = `🎉 *CV Analizzato e Profilo JobFinder Aggiornato!*

👤 *Name:* ${candidateProfile.fullName || ctx.from?.first_name || 'Candidate'}
🎓 *Status:* ${candidateProfile.currentStatus}
🇪🇺 *Erasmus+ / Student Agreement:* ${candidateProfile.erasmusEligible ? 'Eligible ✅' : 'No'}

🎯 *Target Roles:*
${rolesText}

🛠 *Extracted Skills:* ${skillsText || 'General Tech'}
🎨 *Design & Dev Tools:* ${toolsText || 'Figma, Git'}
🗣 *Languages:* ${languagesText || 'English'}

💡 *AI Profile Summary:*
_${candidateProfile.summary}_

🚀 *Tutto pronto!* JobFinder userà il tuo profilo per opportunità compatibili con le tue località e preferenze.`;

    await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, confirmationText, {
      parse_mode: 'Markdown',
    });
  } catch (err: any) {
    console.error('[handleCvUpload] Error processing CV:', err);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ An error occurred while processing your CV: ${err.message}`
    );
  }
}
