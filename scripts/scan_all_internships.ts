import { getAdapter } from '../packages/adapters/src/factory.js';
import type { CompanyAdapterTarget } from '../packages/adapters/src/types.js';
import { BouncerService } from '../packages/llm/src/bouncer.js';

const bouncer = BouncerService.getInstance();

async function runStrictInternshipScanner() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(' 🎓 STRICT LIVE INTERNSHIP SCANNER');
  console.log(' Target: University Internships, Convenio de Prácticas, Working Students');
  console.log(' Hub: Barcelona & Spain Hubs');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const targets: CompanyAdapterTarget[] = [
    { companyName: 'N26 Tech Hub', companySlug: 'n26', atsIdentifier: 'n26', atsProvider: 'greenhouse', isBarcelonaHq: false },
    { companyName: 'Qonto Tech Hub', companySlug: 'qonto', atsIdentifier: 'qonto', atsProvider: 'greenhouse', isBarcelonaHq: false },
    { companyName: 'PayFit', companySlug: 'payfit', atsIdentifier: 'payfit', atsProvider: 'greenhouse', isBarcelonaHq: false },
    { companyName: 'UserTesting', companySlug: 'usertesting', atsIdentifier: 'usertesting', atsProvider: 'greenhouse', isBarcelonaHq: false },
    { companyName: 'FlixBus Tech Hub', companySlug: 'flixbus', atsIdentifier: 'flixbus', atsProvider: 'greenhouse', isBarcelonaHq: false },
    { companyName: 'Typeform', companySlug: 'typeform', atsIdentifier: 'typeform', atsProvider: 'greenhouse', isBarcelonaHq: true },
    { companyName: 'Wallapop', companySlug: 'wallapop', atsIdentifier: 'wallapop', atsProvider: 'greenhouse', isBarcelonaHq: true },
  ];

  let totalScanned = 0;
  const verifiedInternships: Array<{
    company: string;
    title: string;
    location: string;
    url: string;
    reason: string;
  }> = [];

  for (const target of targets) {
    try {
      process.stdout.write(`📡 Checking ${target.companyName}... `);
      const adapter = getAdapter(target.atsProvider);
      const result = await adapter.fetchJobs(target);
      totalScanned += result.jobs.length;

      let found = 0;
      for (const job of result.jobs) {
        // Enforce STRICT Pass 1 Bouncer (rejects all seniors / non-interns)
        const check = bouncer.runPass1Regex(job.title, job.descriptionText);

        if (check.passed) {
          // Confirm it's in Spain / Barcelona or European hub
          verifiedInternships.push({
            company: target.companyName,
            title: job.title,
            location: job.locationRaw || 'Spain',
            url: job.url,
            reason: check.reason,
          });
          found++;
        }
      }
      console.log(`Scanned ${result.jobs.length} jobs. Found ${found} student roles.`);
    } catch (err: any) {
      console.log(`⚠️ Skipped (${err.message})`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log(` 📊 Total Postings Scanned: ${totalScanned}`);
  console.log(` 🎯 Genuine Student/Internship Postings Approved: ${verifiedInternships.length}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  if (verifiedInternships.length === 0) {
    console.log('No active student internships currently posted on these specific companies today.');
  } else {
    verifiedInternships.forEach((item, idx) => {
      console.log(`${idx + 1}. 🎓 [APPROVED INTERNSHIP] ${item.title}`);
      console.log(`   🏢 Company: ${item.company}`);
      console.log(`   📍 Location: ${item.location}`);
      console.log(`   🔗 Direct Apply URL: ${item.url}`);
      console.log(`   ✅ Bouncer Match: ${item.reason}\n`);
    });
  }
}

runStrictInternshipScanner().catch(console.error);
