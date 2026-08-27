import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatCents, SPACE_TYPE_LABELS } from "@/lib/format";

export type SpaceCardData = {
  slug: string;
  name: string;
  type: string;
  city: string;
  capacity: number;
  amenities: string[];
  dayPriceCents: number;
  organization: { name: string };
};

export function SpaceCard({
  space,
  href,
}: {
  space: SpaceCardData;
  href: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="overflow-hidden transition-shadow group-hover:shadow-md">
        <div className="flex h-40 items-center justify-center bg-muted text-sm text-muted-foreground">
          Photo à venir
        </div>
        <div className="flex flex-col gap-1 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {SPACE_TYPE_LABELS[space.type] ?? space.type} · {space.city}
          </p>
          <p className="font-medium text-foreground">{space.name}</p>
          <p className="text-sm text-muted-foreground">
            {space.organization.name} · jusqu&apos;à {space.capacity} pers.
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {formatCents(space.dayPriceCents)}{" "}
            <span className="font-normal text-muted-foreground">/ jour</span>
          </p>
        </div>
      </Card>
    </Link>
  );
}
