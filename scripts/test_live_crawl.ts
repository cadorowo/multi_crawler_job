import { getAdapter } from '../packages/adapters/src/factory.js';
import type { CompanyAdapterTarget } from '../packages/adapters/src/types.js';

async function testLiveCrawl() {
  console.log('🚀 Running Live Verification Crawl on Barcelona Tech Companies...\n');

  const targets: CompanyAdapterTarget[] = [
    {
      companyName: 'Glovo',
      companySlug: 'glovo',
      atsIdentifier: 'glovo',
      atsProvider: 'greenhouse',
      isBarcelonaHq: true,
    },
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
      companyName: 'N26',
      companySlug: 'n26',
      atsIdentifier: 'n26',
      atsProvider: 'greenhouse',
      isBarcelonaHq: false,
    },
  ];

  for (const target of targets) {
    try {
      console.log(`📡 Fetching live jobs for ${target.companyName} via ${target.atsProvider}...`);
      const adapter = getAdapter(target.atsProvider);
      const result = await adapter.fetchJobs(target);

      console.log(`   ✅ Fetched ${result.jobs.length} total jobs from ${target.companyName}`);
      
      const bcnJobs = result.jobs.filter(j => j.isBarcelona);
      console.log(`   📍 Barcelona locations detected: ${bcnJobs.length}`);

      const internships = result.jobs.filter(j => j.jobType === 'internship' || j.jobType === 'working_student' || j.jobType === 'trainee');
      console.log(`   🎓 Internships / Student roles: ${internships.length}`);

      if (internships.length > 0) {
        internships.forEach(j => {
          console.log(`      👉 [${j.jobType.toUpperCase()}] ${j.title} (${j.locationRaw}) -> ${j.url}`);
        });
      } else {
        console.log(`      Sample roles: ${result.jobs.slice(0, 2).map(j => `${j.title} (${j.locationRaw})`).join(' | ')}`);
      }
      console.log('');
    } catch (err: any) {
      console.error(`   ❌ Failed to fetch ${target.companyName}: ${err.message}\n`);
    }
  }

  console.log('🎉 Live ATS Ingestion Verification Complete!');
}

testLiveCrawl().catch(console.error);
