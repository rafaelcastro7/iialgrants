import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        <Card className="border-border/70 bg-card/90">
          <CardContent className="p-6 md:p-10">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-4 w-48 mb-2" />
            <Skeleton className="h-10 w-64 mb-4" />
            <Skeleton className="h-4 w-96 mb-6" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/70 bg-card/85">
            <CardContent className="flex items-start gap-3 p-5">
              <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function GrantDetailSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        <Card className="border-border/70">
          <CardContent className="p-6">
            <Skeleton className="h-6 w-64 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4 mb-4" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-32 rounded-full mx-auto" />
            <Skeleton className="h-4 w-32 mx-auto" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ProposalsListSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-48" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="border-border/70">
          <CardHeader>
            <div className="flex items-start justify-between">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-3 w-64" />
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="flex gap-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-8 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ProposalDetailSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-6 w-48" />
      </div>
      <Card className="border-border/70">
        <CardContent className="p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-20 w-full rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
