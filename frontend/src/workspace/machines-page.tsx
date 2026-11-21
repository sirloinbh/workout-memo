import { Dumbbell } from 'lucide-react';

import { List, ListItem } from '../components/list';
import { SegmentedControl } from '../components/segmented-control';
import { Button } from '../components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { type Machine, officialLabel } from './model';

/** The machine library, filtered by brand. */
export function MachinesPage({
  machines,
  brands,
  brand,
  setBrand,
  setMachineEditor,
}: {
  machines: Machine[];
  brands: { id: number; name: string }[];
  brand: number;
  setBrand: (brand: number) => void;
  setMachineEditor: (machine: Partial<Machine>) => void;
}) {
  return (
    <>
      <SegmentedControl
        label="Brand"
        className="mb-6"
        options={[
          { value: '0', label: 'All brands' },
          ...brands.map((b) => ({ value: String(b.id), label: b.name })),
        ]}
        value={String(brand)}
        onValueChange={(value) => setBrand(Number(value))}
      />
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
          <CardTitle asHeading="h2" className="text-body font-semibold">
            Machine Library
          </CardTitle>
          <CardDescription className="text-caption">
            The base weight differs by model and setting. Check the machine label and manufacturer
            data, then enter it.
          </CardDescription>
        </CardHeader>
        {machines.filter((m) => !brand || m.brand_id === brand).length === 0 ? (
          <EmptyState
            className="m-4 md:m-6"
            headingLevel="h3"
            icon={<Dumbbell />}
            title="Register your own machine"
            description="An unconfirmed base weight can be stored as not entered."
          />
        ) : (
          <List aria-label="Machine" className="px-4 py-1 md:px-6 md:py-2.5">
            {machines
              .filter((m) => !brand || m.brand_id === brand)
              .map((m) => (
                <ListItem
                  data-slot="machine-row"
                  className="flex-wrap gap-2.5 py-4 md:flex-nowrap md:gap-4"
                  key={m.id}
                >
                  <div
                    aria-hidden
                    className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-foreground"
                  >
                    <Dumbbell size={22} />
                  </div>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere] max-md:basis-[calc(100%-3.625rem)]">
                    <h3 className="text-body-sm font-semibold">{m.name}</h3>
                    <p className="mt-1 text-meta text-muted-foreground">
                      {m.brand}
                      {m.single_joint ? ' · Single-joint' : ''} · {m.notes || 'No memo'}
                    </p>
                    {m.official_status && (
                      <p className="mt-1 text-meta text-muted-foreground">
                        Official reference ({m.official_model_name}
                        {m.official_setting ? ` · ${m.official_setting}` : ''}):{' '}
                        {officialLabel({
                          status: m.official_status,
                          raw_value: m.official_raw_value,
                          raw_unit: m.official_raw_unit,
                          weight_kg: m.official_weight_kg,
                          basis: m.official_basis,
                        })}
                        {m.official_source_url && (
                          <>
                            {' · '}
                            <a
                              className="text-foreground underline underline-offset-4"
                              href={m.official_source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Source
                            </a>
                            {` (checked ${m.official_checked_date})`}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  <strong className="text-body-sm font-medium whitespace-nowrap max-md:ml-14.5">
                    {m.base_weight === null ? 'Not entered' : `${m.base_weight} kg`}
                  </strong>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="max-md:ml-auto"
                    onClick={() =>
                      setMachineEditor({
                        ...m,
                        base_weight: m.base_weight,
                      })
                    }
                  >
                    Edit
                  </Button>
                </ListItem>
              ))}
          </List>
        )}
      </Card>
    </>
  );
}
