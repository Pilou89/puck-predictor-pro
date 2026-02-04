import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent 
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Calculator,
  PiggyBank,
  BarChart3,
  Clock,
  Check,
  X,
  Edit2,
  Save
} from "lucide-react";
import { useBankroll } from "@/hooks/useBankroll";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const chartConfig = {
  balance: {
    label: "Capital",
    color: "hsl(var(--primary))",
  },
};

export function BankrollPanel() {
  const { stats, config, isLoading, updateConfig, isUpdating } = useBankroll();
  const [isEditing, setIsEditing] = useState(false);
  const [newBalance, setNewBalance] = useState(stats.initialBalance.toString());

  const handleSaveBalance = () => {
    const value = parseFloat(newBalance);
    if (!isNaN(value) && value > 0) {
      updateConfig({ initial_balance: value });
      setIsEditing(false);
    }
  };

  const profitLoss = stats.currentBalance - stats.initialBalance;
  const isProfitable = profitLoss >= 0;

  // Format chart data
  const chartData = stats.dailyBalances.map(d => ({
    date: format(new Date(d.date), 'dd/MM', { locale: fr }),
    balance: d.balance,
    fullDate: d.date,
  }));

  return (
    <Card className="glass-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Gestion de Bankroll</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Suivi du capital et analyse de risque
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {stats.betsHistory.length} paris
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Capital Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Solde Initial */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <PiggyBank className="w-3.5 h-3.5" />
              <span>Solde Initial</span>
            </div>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  className="h-7 text-sm"
                />
                <Button size="sm" variant="ghost" onClick={handleSaveBalance}>
                  <Save className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">{stats.initialBalance.toFixed(2)}€</span>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    setNewBalance(stats.initialBalance.toString());
                    setIsEditing(true);
                  }}
                >
                  <Edit2 className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Solde Actuel */}
          <div className={cn(
            "p-3 rounded-lg border",
            isProfitable 
              ? "bg-success/10 border-success/30" 
              : "bg-destructive/10 border-destructive/30"
          )}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className="w-3.5 h-3.5" />
              <span>Solde Actuel</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-lg font-bold",
                isProfitable ? "text-success" : "text-destructive"
              )}>
                {stats.currentBalance.toFixed(2)}€
              </span>
              <span className={cn(
                "text-xs font-medium",
                isProfitable ? "text-success" : "text-destructive"
              )}>
                {isProfitable ? "+" : ""}{profitLoss.toFixed(2)}€
              </span>
            </div>
          </div>

          {/* Fonds Engagés */}
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Fonds Engagés</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-primary">
                {stats.pendingStake.toFixed(2)}€
              </span>
              <Badge variant="secondary" className="text-xs">
                {stats.pendingBets} en cours
              </Badge>
            </div>
          </div>

          {/* Unité Conseillée */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Calculator className="w-3.5 h-3.5" />
              <span>1 Unité (1%)</span>
            </div>
            <span className="text-lg font-bold">{stats.suggestedUnit.toFixed(2)}€</span>
          </div>
        </div>

        {/* ROI & Yield */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">ROI Net</span>
              </div>
              {stats.roi >= 0 ? (
                <TrendingUp className="w-4 h-4 text-success" />
              ) : (
                <TrendingDown className="w-4 h-4 text-destructive" />
              )}
            </div>
            <span className={cn(
              "text-2xl font-bold",
              stats.roi >= 0 ? "text-success" : "text-destructive"
            )}>
              {stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(1)}%
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Retour sur investissement
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Yield</span>
              </div>
              {stats.yield >= 0 ? (
                <TrendingUp className="w-4 h-4 text-success" />
              ) : (
                <TrendingDown className="w-4 h-4 text-destructive" />
              )}
            </div>
            <span className={cn(
              "text-2xl font-bold",
              stats.yield >= 0 ? "text-success" : "text-destructive"
            )}>
              {stats.yield >= 0 ? "+" : ""}{stats.yield.toFixed(1)}%
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Efficacité des mises
            </p>
          </div>
        </div>

        {/* Monthly Target Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="font-medium">Objectif Mensuel (+20%)</span>
            </div>
            <span className={cn(
              "font-bold",
              stats.monthlyProgress >= 100 ? "text-success" : "text-muted-foreground"
            )}>
              {stats.monthlyProgress.toFixed(0)}%
            </span>
          </div>
          <Progress 
            value={Math.max(0, Math.min(stats.monthlyProgress, 100))} 
            className="h-3"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0€</span>
            <span className="text-primary font-medium">
              Cible: +{(stats.initialBalance * 0.2).toFixed(2)}€
            </span>
            <span>+{(stats.initialBalance * 0.2).toFixed(0)}€</span>
          </div>
        </div>

        {/* Bankroll Chart */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Évolution du Capital (30j)</span>
          </div>
          
          <div className="h-48 w-full">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10 }} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10 }} 
                  tickLine={false}
                  axisLine={false}
                  domain={['dataMin - 10', 'dataMax + 10']}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ReferenceLine 
                  y={stats.initialBalance} 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeDasharray="5 5"
                  label={{ value: 'Initial', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                />
              </LineChart>
            </ChartContainer>
          </div>
        </div>

        {/* Recent Bets */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">Tous</TabsTrigger>
            <TabsTrigger value="pending">En cours</TabsTrigger>
            <TabsTrigger value="completed">Terminés</TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="mt-3">
            <BetsList bets={stats.betsHistory.slice(0, 5)} />
          </TabsContent>
          
          <TabsContent value="pending" className="mt-3">
            <BetsList bets={stats.betsHistory.filter(b => b.outcome === 'pending').slice(0, 5)} />
          </TabsContent>
          
          <TabsContent value="completed" className="mt-3">
            <BetsList bets={stats.betsHistory.filter(b => b.outcome !== 'pending').slice(0, 5)} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface BetsListProps {
  bets: Array<{
    id: string;
    bet_date: string;
    match_name: string;
    bet_type: string;
    selection: string;
    odds: number;
    stake: number;
    outcome: string;
    actual_gain: number;
    source: string;
  }>;
}

function BetsList({ bets }: BetsListProps) {
  if (bets.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        Aucun pari enregistré
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bets.map((bet) => (
        <div 
          key={bet.id}
          className={cn(
            "p-3 rounded-lg border flex items-center justify-between",
            bet.outcome === 'won' && "bg-success/5 border-success/30",
            bet.outcome === 'lost' && "bg-destructive/5 border-destructive/30",
            bet.outcome === 'pending' && "bg-primary/5 border-primary/30"
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{bet.selection}</span>
              <Badge variant="outline" className="text-xs shrink-0">
                {bet.bet_type.toUpperCase()}
              </Badge>
              {bet.source === 'ai_suggestion' && (
                <Badge variant="secondary" className="text-xs shrink-0">IA</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {bet.match_name} • {format(new Date(bet.bet_date), 'dd/MM', { locale: fr })}
            </div>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-sm font-medium">{bet.stake.toFixed(2)}€ @ {bet.odds.toFixed(2)}</div>
              {bet.outcome === 'won' && (
                <div className="text-xs text-success">+{bet.actual_gain.toFixed(2)}€</div>
              )}
              {bet.outcome === 'lost' && (
                <div className="text-xs text-destructive">-{bet.stake.toFixed(2)}€</div>
              )}
            </div>
            
            {bet.outcome === 'won' && <Check className="w-4 h-4 text-success" />}
            {bet.outcome === 'lost' && <X className="w-4 h-4 text-destructive" />}
            {bet.outcome === 'pending' && <Clock className="w-4 h-4 text-primary" />}
          </div>
        </div>
      ))}
    </div>
  );
}
