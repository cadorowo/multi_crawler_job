import { getAdapter } from '../packages/adapters/src/factory.js';
import type { CompanyAdapterTarget } from '../packages/adapters/src/types.js';
import { BouncerService } from '../packages/llm/src/bouncer.js';

const bouncer = BouncerService.getInstance();

async function runLiveQuery() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(' 🔍 LIVE BARCELONA INTERNSHIP & TECH DESIGN SEARCH QUERY');
  console.log(' Target: UX/UI Design, Product Design, AI/Website Automation & Engineering');
  console.log(' Location: Barcelona, Spain');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const targets: CompanyAdapterTarget[] = [
    {
      companyName: 'Typeform',
      companySlug: 'typeform',
      atsIdentifier: 'typeform',
      atsProvider: 'greenhouse',
      isBarcelonaHq: true,
    },
    {
      companyName: 'Wallapop',
      companySlug: 'wallapop',
      atsIdentifier: 'wallapop',
      atsProvider: 'greenhouse',
      isBarcelonaHq: true,
    },
    {
      companyName: 'N26 (Barcelona Tech Hub)',
      companySlug: 'n26',
      atsIdentifier: 'n26',
      atsProvider: 'greenhouse',
      isBarcelonaHq: false,
    },
    {
      companyName: 'Coverflex (Barcelona Hub)',
      companySlug: 'coverflex',
      atsIdentifier: 'coverflex',
      atsProvider: 'ashby',
      isBarcelonaHq: false,
    },
    {
      companyName: 'Revolut (Spain Hub)',
      companySlug: 'revolut',
      atsIdentifier: 'revolut',
      atsProvider: 'lever',
      isBarcelonaHq: false,
    },
  ];

  let totalScanned = 0;
  let totalBcn = 0;
  const matchedJobs: Array<{
    company: string;
    title: string;
    location: string;
    jobType: string;
    isDesignTech: boolean;
    url: string;
    pass1: boolean;
  }> = [];

  for (const target of targets) {
    try {
      process.stdout.write(`📡 Querying ${target.companyName} (${target.atsProvider})... `);
      const adapter = getAdapter(target.atsProvider);
      const result = await adapter.fetchJobs(target);
      totalScanned += result.jobs.length;

      const bcnRoles = result.jobs.filter(j => j.isBarcelona || j.locationRaw?.toLowerCase().includes('barcelona') || j.locationRaw?.toLowerCase().includes('spain'));
      totalBcn += bcnRoles.length;
      console.log(`✅ ${result.jobs.length} jobs scanned (${bcnRoles.length} Barcelona/Spain)\n`);

      for (const job of bcnRoles) {
        const titleLower = job.title.toLowerCase();
        const descLower = job.descriptionText.toLowerCase();

        // Check if relevant to Design / Product / AI / Tech / Intern
        const isDesignTech =
          titleLower.includes('design') ||
          titleLower.includes('ux') ||
          titleLower.includes('ui') ||
          titleLower.includes('product') ||
          titleLower.includes('frontend') ||
          titleLower.includes('ai') ||
          titleLower.includes('automation') ||
          titleLower.includes('intern') ||
          titleLower.includes('prácticas') ||
          titleLower.includes('student');

        const bouncerPass1 = bouncer.runPass1Regex(job.title, job.descriptionText).passed;

        if (isDesignTech || bouncerPass1) {
          matchedJobs.push({
            company: target.companyName,
            title: job.title,
            location: job.locationRaw || 'Barcelona, Spain',
            jobType: job.jobType,
            isDesignTech,
            url: job.url,
            pass1: bouncerPass1,
          });
        }
      }
    } catch (err: any) {
      console.log(`⚠️ Skip: ${err.message}\n`);
    }
  }

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(` 📊 SUMMARY: ${totalScanned} total jobs scanned across active ATS boards`);
  console.log(` 📍 ${totalBcn} Spain/Barcelona positions evaluated`);
  console.log(` 🎯 ${matchedJobs.length} Design, Product, AI & Internship roles matched:`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  matchedJobs.forEach((m, idx) => {
    const badge = m.pass1 ? '🎓 [INTERNSHIP/STUDENT PASS]' : '💼 [ROLE/DESIGN MATCH]';
    console.log(`${idx + 1}. ${badge} ${m.title}`);
    console.log(`   🏢 Company: ${m.company}`);
    console.log(`   📍 Location: ${m.location}`);
    console.log(`   🔗 Direct Apply URL: ${m.url}`);
    console.log('');
  });
}

runLiveQuery().catch(console.error);
