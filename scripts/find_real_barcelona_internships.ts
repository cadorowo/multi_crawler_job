import { getAdapter } from '../packages/adapters/src/factory.js';
import type { CompanyAdapterTarget } from '../packages/adapters/src/types.js';
import { BouncerService } from '../packages/llm/src/bouncer.js';

const bouncer = BouncerService.getInstance();

async function findStrictInternships() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(' 🎓 STRICT BARCELONA INTERNSHIP & STUDENT CONVENIO FINDER');
  console.log(' Strict Rule: Discard ALL Senior/Permanent roles. ONLY student/intern roles.');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Test across top tech companies & international hubs with active internship programs
  const targets: CompanyAdapterTarget[] = [
    {
      companyName: 'N26 Tech Hub',
      companySlug: 'n26',
      atsIdentifier: 'n26',
      atsProvider: 'greenhouse',
      isBarcelonaHq: false,
    },
    {
      companyName: 'Wallapop',
      companySlug: 'wallapop',
      atsIdentifier: 'wallapop',
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
      companyName: 'Glovo',
      companySlug: 'glovo',
      atsIdentifier: 'glovo',
      atsProvider: 'greenhouse',
      isBarcelonaHq: true,
    },
    {
      companyName: 'Factorial HR',
      companySlug: 'factorial',
      atsIdentifier: 'factorial',
      atsProvider: 'factorial',
      isBarcelonaHq: true,
    },
    {
      companyName: 'Lodgify',
      companySlug: 'lodgify',
      atsIdentifier: 'lodgify',
      atsProvider: 'teamtailor',
      isBarcelonaHq: true,
    },
    {
      companyName: 'Restb.ai',
      companySlug: 'restbai',
      atsIdentifier: 'restbai',
      atsProvider: 'lever',
      isBarcelonaHq: true,
    },
  ];

  const strictlyApprovedInternships: Array<{
    company: string;
    title: string;
    location: string;
    jobType: string;
    url: string;
    reason: string;
  }> = [];

  for (const target of targets) {
    try {
      const adapter = getAdapter(target.atsProvider);
      const result = await adapter.fetchJobs(target);

      for (const job of result.jobs) {
        // Run Strict Pass 1 Bouncer
        const bouncerCheck = bouncer.runPass1Regex(job.title, job.descriptionText);

        // Strict: ONLY jobs that pass the bouncer
        if (bouncerCheck.passed) {
          // Verify it is in Spain/Barcelona or Remote Spain
          const isSpainOrBcn =
            job.isBarcelona ||
            job.locationRaw?.toLowerCase().includes('barcelona') ||
            job.locationRaw?.toLowerCase().includes('spain') ||
            job.locationRaw?.toLowerCase().includes('madrid') ||
            target.isBarcelonaHq;

          if (isSpainOrBcn) {
            strictlyApprovedInternships.push({
              company: target.companyName,
              title: job.title,
              location: job.locationRaw || 'Barcelona, Spain',
              jobType: job.jobType,
              url: job.url,
              reason: bouncerCheck.reason,
            });
          }
        }
      }
    } catch (err: any) {
      // ignore
    }
  }

  console.log(`🎯 STRICT RESULTS: Found ${strictlyApprovedInternships.length} Genuine Internship / Student Roles:\n`);

  if (strictlyApprovedInternships.length === 0) {
    console.log('No active internships found on these specific 7 boards right now.');
  } else {
    strictlyApprovedInternships.forEach((item, i) => {
      console.log(`${i + 1}. 🎓 [GENUINE INTERNSHIP] ${item.title}`);
      console.log(`   🏢 Company: ${item.company}`);
      console.log(`   📍 Location: ${item.location}`);
      console.log(`   🔗 Direct Apply URL: ${item.url}`);
      console.log(`   ✅ Bouncer Verification: ${item.reason}\n`);
    });
  }
}

findStrictInternships().catch(console.error);
