"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BookCard } from "@/components/library/book-card";
import { BookGrid } from "@/components/library/book-grid";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "@/server/trpc/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type CollectionItem = RouterOutputs["collections"]["get"]["items"][number];

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: collection, isLoading } = trpc.collections.get.useQuery(
    { id },
    { enabled: !!id },
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Collection not found.</p>
        <Link
          href="/library"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Library
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">
            {collection.name}
          </h1>
          <Badge
            className="shrink-0"
            style={{
              backgroundColor: `${collection.color ?? "#6366f1"}20`,
              color: collection.color ?? "#6366f1",
            }}
          >
            {collection.items?.length ?? 0} books
          </Badge>
        </div>
        {collection.description && (
          <p className="text-sm text-muted-foreground">
            {collection.description}
          </p>
        )}
      </div>

      {/* Books grid */}
      {collection.items && collection.items.length > 0 ? (
        <BookGrid>
          {collection.items.map((item: CollectionItem) => (
            <BookCard key={item.id} book={item} />
          ))}
        </BookGrid>
      ) : (
        <div className="rounded-lg border border-border bg-muted/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            This collection is empty. Add books from the library.
          </p>
        </div>
      )}
    </div>
  );
}
