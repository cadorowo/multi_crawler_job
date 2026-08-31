// Drizzle Kit loads this file directly while generating migrations. Keeping a
// dedicated entry point avoids resolving NodeNext runtime `.js` imports from
// the TypeScript schema source.
export * from './src/schema/enums.ts';
export * from './src/schema/users.ts';
export * from './src/schema/companies.ts';
export * from './src/schema/jobs.ts';
export * from './src/schema/user-job-interactions.ts';
