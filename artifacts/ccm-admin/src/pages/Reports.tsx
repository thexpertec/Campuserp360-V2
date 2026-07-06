import { useGetAdminDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ['hsl(138 85% 16%)', 'hsl(122 97% 41%)', 'hsl(152 69% 31%)', 'hsl(138 85% 60%)', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];

export default function Reports() {
  const { data: summary, isLoading, error } = useGetAdminDashboardSummary();

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive font-medium">Failed to load reporting data</p>
      </div>
    );
  }

  const byClassData = summary?.byClass.map(item => ({
    name: item.status, // usually this holds the class name from API
    count: item.count
  })) || [];

  const byStatusData = summary?.byStatus.map(item => ({
    name: item.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    count: item.count
  })) || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Reports & Analytics</h1>
        <p className="text-muted-foreground mt-1">Aggregate views of admission data and capacity.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Class Breakdown */}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>Applications by Class/Program</CardTitle>
            <CardDescription>Total applications received per grade level</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byClassData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Breakdown */}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>Pipeline Status</CardTitle>
            <CardDescription>Current state of all applications</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
             {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="name"
                    labelLine={false}
                  >
                    {byStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            {!isLoading && (
              <div className="flex flex-wrap justify-center gap-4 mt-2">
                {byStatusData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    {entry.name}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Capacity */}
        <Card className="border-border shadow-sm md:col-span-2">
          <CardHeader>
            <CardTitle>Admission Capacity Tracker</CardTitle>
            <CardDescription>Overall available seats vs. qualified candidates</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-24 w-full" /> : (
              <div className="flex flex-col md:flex-row items-center justify-around p-6 bg-muted/30 rounded-xl border border-border">
                <div className="text-center mb-6 md:mb-0">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Total Capacity</p>
                  <p className="text-4xl font-bold text-foreground">{summary?.totalSeats || 0}</p>
                </div>
                <div className="hidden md:block w-px h-16 bg-border" />
                <div className="text-center mb-6 md:mb-0">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Currently Qualified</p>
                  <p className="text-4xl font-bold text-primary">{summary?.admitted || 0}</p>
                </div>
                <div className="hidden md:block w-px h-16 bg-border" />
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Remaining Seats</p>
                  <p className="text-4xl font-bold text-accent">{summary?.spotsRemaining || 0}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
