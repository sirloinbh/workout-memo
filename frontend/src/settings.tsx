import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';

import { AlertBanner } from './components/ui/alert-banner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { PageHeader } from './components/ui/page-header';
import { pages } from './workspace/model';
import { RestPushToggle } from './workspace/rest-push-toggle';
import type { PushState } from './workspace/use-push';
import { WeeklySummaryToggle } from './workspace/weekly-summary-toggle';

/**
 * #508: every preference in one place. The notification switches, and the
 * links to the data pages (Backup & Export, Machine Library) that used to sit in the main menu.
 */
export function Settings({ pushState }: { pushState: PushState }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Change how the app behaves. Everything here applies to this browser or account right away."
      />
      {pushState.pushWarning && <AlertBanner>{pushState.pushWarning}</AlertBanner>}
      <Card>
        <CardHeader>
          <CardTitle className="text-body font-semibold">Notifications</CardTitle>
          <CardDescription>
            Push messages from the server. Each device is set up on its own.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <RestPushToggle pushState={pushState} />
          <WeeklySummaryToggle />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-body font-semibold">Data</CardTitle>
          <CardDescription>Your records and the machines they use.</CardDescription>
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
