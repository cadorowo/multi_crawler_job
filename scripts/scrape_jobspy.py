#!/usr/bin/env python3
"""
Barcelona Internship Discovery Bot - JobSpy Aggregator Collector
Scrapes public job listings from LinkedIn, Indeed, Glassdoor via python-jobspy.
"""

import sys
import json
import argparse
from datetime import datetime, date

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if hasattr(obj, 'item'): # numpy types
        return obj.item()
    return str(obj)

def main():
    parser = argparse.ArgumentParser(description="Scrape job boards via JobSpy")
    parser.add_argument("--search-term", "-s", default="UX UI Design Intern", help="Job title / query keywords")
    parser.add_argument("--location", "-l", default="Barcelona, Spain", help="Target location")
    parser.add_argument("--country-indeed", "-c", default="Spain", help="Country for Indeed")
    parser.add_argument("--results-wanted", "-n", type=int, default=25, help="Max results to fetch per site")
    parser.add_argument("--hours-old", type=int, default=72, help="Filter jobs posted within X hours")
    parser.add_argument("--sites", default="linkedin,indeed,glassdoor", help="Comma-separated site list")

    args = parser.parse_args()

    site_names = [s.strip().lower() for s in args.sites.split(",") if s.strip()]

    try:
        from jobspy import scrape_jobs
    except ImportError:
        sys.stderr.write(
            "[scrape_jobspy.py] Warning: 'python-jobspy' is not installed in Python environment.\n"
            "Run 'pip install python-jobspy' to enable aggregator scraping.\n"
        )
        print("[]")
        sys.exit(0)

    try:
        sys.stderr.write(
            f"[scrape_jobspy.py] Scraping {site_names} for '{args.search_term}' in '{args.location}'...\n"
        )
        
        jobs_df = scrape_jobs(
            site_name=site_names,
            search_term=args.search_term,
            location=args.location,
            results_wanted=args.results_wanted,
            hours_old=args.hours_old,
            country_indeed=args.country_indeed,
        )

        if jobs_df is None or jobs_df.empty:
            sys.stderr.write("[scrape_jobspy.py] No jobs found for query.\n")
            print("[]")
            sys.exit(0)

        # Convert DataFrame records to list of dicts
        records = jobs_df.to_dict(orient="records")

        # Clean NaN and handle non-serializable fields
        cleaned_records = []
        for r in records:
            cleaned = {}
            for k, v in r.items():
                if v is None or (isinstance(v, float) and v != v): # check NaN
                    cleaned[k] = None
                else:
                    cleaned[k] = v
            cleaned_records.append(cleaned)

        sys.stderr.write(f"[scrape_jobspy.py] Successfully scraped {len(cleaned_records)} jobs.\n")
        print(json.dumps(cleaned_records, default=json_serial, indent=2))

    except Exception as err:
        sys.stderr.write(f"[scrape_jobspy.py] Error during scraping: {err}\n")
        print("[]")
        sys.exit(0)

if __name__ == "__main__":
    main()
