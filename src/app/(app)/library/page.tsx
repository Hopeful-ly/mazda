"use client";

import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo } from "react";
import { BookCard } from "@/components/library/book-card";
import { BookGrid } from "@/components/library/book-grid";
import { type FilterState, Filters } from "@/components/library/filters";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 24;

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      }
    >
      <LibraryPageContent />
    </Suspense>
  );
}

function LibraryPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const filters: FilterState = useMemo(
    () => ({
      search: searchParams.get("search") ?? "",
      format: searchParams.get("format") ?? "",
      status: searchParams.get("status") ?? "",
      sortBy: searchParams.get("sortBy") ?? "createdAt",
    }),
    [searchParams],
  );

  const page = Number(searchParams.get("page") ?? "1");

  const setParams = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.push(`/library?${params.toString()}`);
    },
    [searchParams, router],
  );

  const handleFiltersChange = useCallback(
    (next: FilterState) => {
      setParams({
        search: next.search,
        format: next.format,
        status: next.status,
        sortBy: next.sortBy,
        page: "1",
      });
    },
    [setParams],
  );

  const { data, isLoading } = trpc.books.list.useQuery({
    search: filters.search || undefined,
    format: filters.format || undefined,
    status: filters.status || undefined,
    sortBy: (filters.sortBy || "createdAt") as
      | "createdAt"
      | "title"
      | "author"
      | "progress"
      | "lastReadAt",
    sortOrder: "desc",
    page,
    limit: PAGE_SIZE,
  });

  const books = data?.books ?? [];
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Library</h1>

      {/* Filters */}
      <Filters value={filters} onChange={handleFiltersChange} />

      {/* Book grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : books.length > 0 ? (
        <>
          <BookGrid>
            {books.map((book: Parameters<typeof BookCard>[0]["book"]) => (
              <BookCard key={book.id} book={book} />
            ))}
          </BookGrid>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setParams({ page: String(page - 1) })}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setParams({ page: String(page + 1) })}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-border bg-muted/50 p-12 text-center">
          <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            No books found
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {filters.search || filters.format || filters.status
              ? "Try adjusting your filters."
              : "Upload your first book to get started."}
          </p>
          {!filters.search && !filters.format && !filters.status && (
            <Link href="/upload">
              <Button>Upload a Book</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
