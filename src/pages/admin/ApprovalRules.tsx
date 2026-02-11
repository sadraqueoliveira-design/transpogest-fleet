import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Users, ShieldCheck, Clock, UserPlus, Pencil } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { uploadSignature } from "@/lib/signatureUtils";

interface DriverGroup {
  id: string;
  name: string;
  created_at: string;
  member_count?: number;
}

interface ApprovalRule {
  id: string;
  manager_id: string;
  driver_group_id: string;
  allowed_reasons: string[];
  active_hours_start: string;
  active_hours_end: string;
  digital_signature_url: string | null;
  is_active: boolean;
  created_at: string;
  group_name?: string;
  manager_name?: string;
}

interface DriverProfile {
  id: string;
  full_name: string | null;
}

const REASON_OPTIONS = [
  { value: "sick_leave", label: "Baixa por doença" },
  { value: "vacation", label: "Férias" },
  { value: "rest", label: "Repouso" },
  { value: "exempt_vehicle", label: "Veículo isento" },
  { value: "other_work", label: "Outro trabalho" },
  { value: "other", label: "Disponível" },
];

export default function ApprovalRulesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Groups
  const [groups, setGroups] = useState<DriverGroup[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  // Group members
  const [selectedGroup, setSelectedGroup] = useState<DriverGroup | null>(null);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [allDrivers, setAllDrivers] = useState<DriverProfile[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);

  // Rules
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [showNewRule, setShowNewRule] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    driver_group_id: "",
    allowed_reasons: [] as string[],
    active_hours_start: "20:00",
    active_hours_end: "08:00",
  });
  const [showRuleSig, setShowRuleSig] = useState(false);
  const [pendingRuleId, setPendingRuleId] = useState<string | null>(null);
  const [sigLoading, setSigLoading] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);

  // Managers list
  const [managers, setManagers] = useState<DriverProfile[]>([]);

  const fetchAll = async () => {
    const [groupsRes, rulesRes, driversRes, managerRolesRes] = await Promise.all([
      supabase.from("driver_groups" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("approval_rules" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("user_roles").select("user_id").in("role", ["admin", "manager"]),
    ]);

    // Groups with member counts
    const groupsData = (groupsRes.data || []) as any[];
    if (groupsData.length > 0) {
      const { data: memberships } = await supabase
        .from("driver_group_members" as any)
        .select("group_id");
      
      const countMap = new Map<string, number>();
      for (const m of (memberships || []) as any[]) {
        countMap.set(m.group_id, (countMap.get(m.group_id) || 0) + 1);
      }
      for (const g of groupsData) {
        g.member_count = countMap.get(g.id) || 0;
      }
    }
    setGroups(groupsData);

    // Rules enriched
    const rulesData = (rulesRes.data || []) as any[];
    const profileMap = new Map((driversRes.data || []).map(p => [p.id, p.full_name]));
    const groupMap = new Map(groupsData.map((g: any) => [g.id, g.name]));
    for (const r of rulesData) {
      r.group_name = groupMap.get(r.driver_group_id) || "—";
      r.manager_name = profileMap.get(r.manager_id) || "—";
    }
    setRules(rulesData);

    setAllDrivers(driversRes.data || []);

    const managerIds = (managerRolesRes.data || []).map((r: any) => r.user_id);
    setManagers((driversRes.data || []).filter(p => managerIds.includes(p.id)));
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setSavingGroup(true);
    const { error } = await supabase.from("driver_groups" as any).insert({ name: newGroupName.trim(), created_by: user?.id } as any);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Grupo criado" });
      setNewGroupName("");
      setShowNewGroup(false);
      fetchAll();
    }
    setSavingGroup(false);
  };

  const handleDeleteGroup = async (id: string) => {
    const { error } = await supabase.from("driver_groups" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      fetchAll();
    }
  };

  const openMembers = async (group: DriverGroup) => {
    setSelectedGroup(group);
    const { data } = await supabase.from("driver_group_members" as any).select("driver_id").eq("group_id", group.id);
    setGroupMembers((data || []).map((m: any) => m.driver_id));
    setShowMembers(true);
  };

  const handleSaveMembers = async () => {
    if (!selectedGroup) return;
    setSavingMembers(true);

    // Delete all existing, re-insert
    await supabase.from("driver_group_members" as any).delete().eq("group_id", selectedGroup.id);
    
    if (groupMembers.length > 0) {
      const rows = groupMembers.map(driver_id => ({ group_id: selectedGroup.id, driver_id }));
      const { error } = await supabase.from("driver_group_members" as any).insert(rows as any);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        setSavingMembers(false);
        return;
      }
    }

    toast({ title: "Membros atualizados" });
    setShowMembers(false);
    setSavingMembers(false);
    fetchAll();
  };

  const handleCreateRule = async () => {
    if (!ruleForm.driver_group_id || !user) return;
    setSavingRule(true);

    const { data, error } = await supabase.from("approval_rules" as any).insert({
      manager_id: user.id,
      driver_group_id: ruleForm.driver_group_id,
      allowed_reasons: ruleForm.allowed_reasons,
      active_hours_start: ruleForm.active_hours_start,
      active_hours_end: ruleForm.active_hours_end,
    } as any).select("id").single();

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setPendingRuleId((data as any).id);
      setShowNewRule(false);
      setShowRuleSig(true);
      fetchAll();
    }
    setSavingRule(false);
  };

  const handleUpdateRule = async () => {
    if (!editingRule || !ruleForm.driver_group_id) return;
    setSavingRule(true);

    const { error } = await supabase.from("approval_rules" as any)
      .update({
        driver_group_id: ruleForm.driver_group_id,
        allowed_reasons: ruleForm.allowed_reasons,
        active_hours_start: ruleForm.active_hours_start,
        active_hours_end: ruleForm.active_hours_end,
      } as any)
      .eq("id", editingRule.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Regra atualizada" });
      setEditingRule(null);
      setShowNewRule(false);
      fetchAll();
    }
    setSavingRule(false);
  };

  const openEditRule = (rule: ApprovalRule) => {
    setEditingRule(rule);
    setRuleForm({
      driver_group_id: rule.driver_group_id,
      allowed_reasons: rule.allowed_reasons || [],
      active_hours_start: rule.active_hours_start,
      active_hours_end: rule.active_hours_end,
    });
    setShowNewRule(true);
  };

  const handleRuleSignature = async (dataUrl: string) => {
    if (!pendingRuleId || !user) return;
    setSigLoading(true);
    try {
      const sigUrl = await uploadSignature(dataUrl, user.id, "rule");
      const { error } = await supabase.from("approval_rules" as any)
        .update({ digital_signature_url: sigUrl } as any)
        .eq("id", pendingRuleId);
      if (error) throw error;
      toast({ title: "Assinatura guardada na regra" });
      setShowRuleSig(false);
      setPendingRuleId(null);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSigLoading(false);
    }
  };

  const handleToggleRule = async (id: string, active: boolean) => {
    await supabase.from("approval_rules" as any).update({ is_active: !active } as any).eq("id", id);
    fetchAll();
  };

  const handleDeleteRule = async (id: string) => {
    await supabase.from("approval_rules" as any).delete().eq("id", id);
    fetchAll();
  };

  // Filter drivers (only those with 'driver' role)
  const driverRoleIds = allDrivers.map(d => d.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Regras de Auto-Aprovação</h1>
        <p className="text-sm text-muted-foreground">Gerir grupos de motoristas e regras para aprovação fora de horas</p>
      </div>

      <Tabs defaultValue="groups">
        <TabsList>
          <TabsTrigger value="groups" className="gap-2"><Users className="h-4 w-4" /> Grupos</TabsTrigger>
          <TabsTrigger value="rules" className="gap-2"><ShieldCheck className="h-4 w-4" /> Regras</TabsTrigger>
        </TabsList>

        {/* GROUPS TAB */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowNewGroup(true)}>
              <Plus className="h-4 w-4 mr-2" /> Novo Grupo
            </Button>
          </div>

          {groups.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Sem grupos criados.</CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {groups.map(g => (
                <Card key={g.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      {g.name}
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteGroup(g.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{g.member_count || 0} motoristas</p>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => openMembers(g)}>
                      <UserPlus className="h-4 w-4 mr-2" /> Gerir Membros
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* RULES TAB */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => {
              setEditingRule(null);
              setRuleForm({ driver_group_id: "", allowed_reasons: [], active_hours_start: "20:00", active_hours_end: "08:00" });
              setShowNewRule(true);
            }}>
              <Plus className="h-4 w-4 mr-2" /> Nova Regra
            </Button>
          </div>

          {rules.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Sem regras configuradas.</CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Horário Ativo</TableHead>
                    <TableHead>Motivos</TableHead>
                    <TableHead>Assinatura</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.group_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {r.active_hours_start} — {r.active_hours_end}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(r.allowed_reasons || []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">Todos</span>
                          ) : (
                            r.allowed_reasons.map(reason => (
                              <Badge key={reason} variant="secondary" className="text-xs">
                                {REASON_OPTIONS.find(o => o.value === reason)?.label || reason}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.digital_signature_url ? (
                          <img src={r.digital_signature_url} alt="Sig" className="h-8 rounded border bg-white px-1" />
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => { setPendingRuleId(r.id); setShowRuleSig(true); }}>
                            Adicionar
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={r.is_active ? "default" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => handleToggleRule(r.id, r.is_active)}
                        >
                          {r.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditRule(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* New Group Dialog */}
      <Dialog open={showNewGroup} onOpenChange={setShowNewGroup}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo Grupo de Motoristas</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Nome do grupo</Label>
            <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Ex: Frota Internacional" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewGroup(false)}>Cancelar</Button>
            <Button onClick={handleCreateGroup} disabled={savingGroup || !newGroupName.trim()}>
              {savingGroup ? "A criar..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <Dialog open={showMembers} onOpenChange={o => { if (!o) setShowMembers(false); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Membros: {selectedGroup?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {allDrivers.map(d => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border p-2">
                <Checkbox
                  checked={groupMembers.includes(d.id)}
                  onCheckedChange={checked => {
                    if (checked) setGroupMembers(prev => [...prev, d.id]);
                    else setGroupMembers(prev => prev.filter(id => id !== d.id));
                  }}
                />
                <span className="text-sm">{d.full_name || d.id}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMembers(false)}>Cancelar</Button>
            <Button onClick={handleSaveMembers} disabled={savingMembers}>
              {savingMembers ? "A guardar..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New/Edit Rule Dialog */}
      <Dialog open={showNewRule} onOpenChange={(o) => { if (!o) { setShowNewRule(false); setEditingRule(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Editar Regra de Auto-Aprovação" : "Nova Regra de Auto-Aprovação"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Grupo de motoristas</Label>
              <Select value={ruleForm.driver_group_id} onValueChange={v => setRuleForm(f => ({ ...f, driver_group_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar grupo" /></SelectTrigger>
                <SelectContent>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Motivos permitidos (vazio = todos)</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {REASON_OPTIONS.map(o => (
                  <div key={o.value} className="flex items-center gap-2">
                    <Checkbox
                      checked={ruleForm.allowed_reasons.includes(o.value)}
                      onCheckedChange={checked => {
                        setRuleForm(f => ({
                          ...f,
                          allowed_reasons: checked
                            ? [...f.allowed_reasons, o.value]
                            : f.allowed_reasons.filter(r => r !== o.value),
                        }));
                      }}
                    />
                    <span className="text-sm">{o.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Hora início</Label>
                <Input type="time" value={ruleForm.active_hours_start} onChange={e => setRuleForm(f => ({ ...f, active_hours_start: e.target.value }))} />
              </div>
              <div>
                <Label>Hora fim</Label>
                <Input type="time" value={ruleForm.active_hours_end} onChange={e => setRuleForm(f => ({ ...f, active_hours_end: e.target.value }))} />
              </div>
            </div>

            {!editingRule && (
              <p className="text-xs text-muted-foreground">Após criar a regra, será pedido para desenhar a assinatura digital do gestor.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNewRule(false); setEditingRule(null); }}>Cancelar</Button>
            <Button
              onClick={editingRule ? handleUpdateRule : handleCreateRule}
              disabled={savingRule || !ruleForm.driver_group_id}
            >
              {savingRule ? "A guardar..." : editingRule ? "Guardar Alterações" : "Criar e Assinar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rule Signature Pad */}
      <SignaturePad
        open={showRuleSig}
        onOpenChange={o => { if (!o) { setShowRuleSig(false); setPendingRuleId(null); } }}
        title="Assinatura para Auto-Aprovação"
        subtitle="Esta assinatura será aplicada automaticamente nas declarações aprovadas fora de horas"
        onConfirm={handleRuleSignature}
        loading={sigLoading}
      />
    </div>
  );
}
