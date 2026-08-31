import { type Context } from 'grammy';
import { db, users, eq } from '@bcn-intern-bot/db';

export async function handleStart(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
  const username = ctx.from?.username || ctx.from?.first_name || 'Candidate';

  if (telegramId) {
    try {
      // Ensure user record exists in database
      const existing = await db.query.users.findFirst({
        where: eq(users.telegramId, telegramId),
      });

      if (!existing) {
        await db.insert(users).values({
          telegramId,
          telegramUsername: ctx.from?.username,
          telegramChatId: ctx.chat?.id ? String(ctx.chat.id) : telegramId,
          fullName: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || username,
          isActive: true,
        });
      }
    } catch (err) {
      console.log(`[JobFinder] Database unavailable during onboarding: ${(err as any)?.message}`);
    }
  }

  const welcomeMessage = `👋 *Ciao ${username}! Benvenuto in JobFinder* 🚀

JobFinder trova opportunità di stage e junior role in base al tuo profilo, alle località desiderate e ai vincoli contrattuali. Paseo è il bridge intelligente che ti aiuta con richieste naturali.

---

*Come iniziare:*
1. ⚙️ Usa \`/setup\` per impostare ruoli, località, modalità e contratto.
2. 📄 Invia il tuo CV in PDF per arricchire automaticamente il profilo tramite Paseo.
3. 🎯 Ricevi match e notifiche quando vengono indicizzate opportunità compatibili.
4. 💼 Salva le opportunità o segna le candidature direttamente dalle card.

---

*Comandi:*
• \`/setup <ruoli> | <località> | <modalità> | <contratti> | <lingue>\`
• \`/profile\` — visualizza il profilo
• \`/matches\` — ultimi match notificati
• \`/search <parola chiave>\` — cerca nell’indice
• \`/my_applications\` — candidature inviate
• \`/stats\` — stato dell’indice

Esempio:
\`/setup product design intern | Milano, Berlino, Remote | hybrid | Erasmus+, Convenio | Italiano, English\``;

  await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
}
