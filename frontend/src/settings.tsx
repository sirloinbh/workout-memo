import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';

import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { PageHeader } from './components/ui/page-header';
import { pages } from './workspace/model';
import { WeeklySummaryToggle } from './workspace/weekly-summary-toggle';

/**
 * #508: every preference in one place. The weekly summary notification switch, and the
 * links to the data pages (Backup & Export, Machine Library) that used to sit in the main menu.
 */
export function Settings() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <Card>
        <CardHeader>
          <CardTitle className="text-body font-semibold">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <WeeklySummaryToggle />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-body font-semibold">Data</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-body-sm">
            <li>
              <Link
                to={pages.backup}
                className="inline-flex min-h-9 items-center gap-1 underline-offset-4 hover:underline pointer-coarse:min-h-11"
              >
                Backup &amp; Export <ArrowRight className="size-4" aria-hidden />
              </Link>
            </li>
            <li>
              <Link
                to={pages.machines}
                className="inline-flex min-h-9 items-center gap-1 underline-offset-4 hover:underline pointer-coarse:min-h-11"
              >
                Machine Library <ArrowRight className="size-4" aria-hidden />
              </Link>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
