"use client";

import { Heart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface BookCardBook {
  id: string;
  title: string;
  author: string | null;
  format: string;
  tags?: { id: string; name: string }[];
  userBook?: {
    status: string | null;
    progress: number;
    isFavorite: boolean;
  } | null;
}

interface BookCardProps {
  book: BookCardBook;
}

const statusLabels: Record<
  string,
  {
    label: string;
    color: "primary" | "warning" | "success" | "danger" | "default";
  }
> = {
  WANT_TO_READ: { label: "Want to Read", color: "primary" },
  READING: { label: "Reading", color: "warning" },
  FINISHED: { label: "Finished", color: "success" },
  DROPPED: { label: "Dropped", color: "danger" },
};

export function BookCard({ book }: BookCardProps) {
  const utils = trpc.useUtils();
  const [coverFailed, setCoverFailed] = useState(false);
  const coverInitial = useMemo(() => {
    const value = (book.title || "?").trim();
    return value ? (value[0]?.toUpperCase() ?? "?") : "?";
  }, [book.title]);

  const favoriteMutation = trpc.books.updateUserBook.useMutation({
    onSuccess: () => {
      utils.books.list.invalidate();
      utils.books.recent.invalidate();
      utils.books.stats.invalidate();
    },
  });

  const isFavorite = book.userBook?.isFavorite ?? false;
  const status = book.userBook?.status ?? null;
  const progress = book.userBook?.progress ?? 0;
  const statusInfo = status ? statusLabels[status] : null;

  const handleFavoriteToggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      favoriteMutation.mutate({
        bookId: book.id,
        isFavorite: !isFavorite,
      });
    },
    [book.id, isFavorite, favoriteMutation],
  );

  return (
    <Link
      href={`/books/${book.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-background transition-shadow hover:shadow-md"
    >
      {/* Cover */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {!coverFailed ? (
          <Image
            src={`/api/books/${book.id}/cover`}
            alt={book.title}
            fill
            unoptimized
            className="object-cover transition-transform duration-200 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-muted via-muted to-muted/80">
            <span className="text-3xl font-semibold text-muted-foreground/70">
              {coverInitial}
            </span>
          </div>
        )}

        {/* Favorite button */}
        <button
          type="button"
          onClick={handleFavoriteToggle}
          disabled={favoriteMutation.isPending}
          className={cn(
            "absolute top-2 right-2 rounded-full bg-black/40 p-1.5 backdrop-blur-sm transition-colors hover:bg-black/60",
            isFavorite ? "text-red-400" : "text-white/70",
          )}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
        </button>

        {/* Format badge */}
        <div className="absolute bottom-2 left-2">
          <Badge className="bg-black/50 text-white text-[10px] backdrop-blur-sm">
            {book.format}
          </Badge>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
          {book.title}
        </h3>
        {book.author && (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {book.author}
          </p>
        )}

        {/* Status badge */}
        {statusInfo && (
          <div className="mt-auto pt-1">
            <Badge color={statusInfo.color} className="text-[10px]">
              {statusInfo.label}
            </Badge>
          </div>
        )}

        {/* Progress bar for reading */}
        {status === "READING" && progress > 0 && (
          <ProgressBar value={progress} className="mt-1" />
        )}

        {/* Tags */}
        {book.tags && book.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {book.tags.slice(0, 3).map((tag) => (
              <Badge key={tag.id} className="text-[10px]">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
