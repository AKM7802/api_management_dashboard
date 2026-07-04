import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardContent>
    </Card>
  );
}
