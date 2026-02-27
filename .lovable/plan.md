

# Adicionar widget/tab "Entreposto" no Dashboard

## Contexto
Apos reclassificar entrepostos e centros de distribuicao como hubs/bases, esses veiculos deixaram de ter visibilidade propria no Dashboard. Vamos adicionar um novo filtro dedicado.

## Alteracoes (ficheiro unico: `src/pages/admin/Dashboard.tsx`)

### 1. Novo helper `isAtDepot`
Criar funcao similar a `isAtStore` e `isAtSupplier` que identifica veiculos junto a entrepostos/centros de distribuicao:

```typescript
const isAtDepot = (v: Vehicle) => {
  const h = getNearestHub(v);
  if (!h || !h.type) return false;
  const t = h.type.toLowerCase();
  return ["entreposto arp", "centro de distribuição"].includes(t);
};
```

### 2. Novo campo em `stats`
Adicionar `atDepot` ao objeto de estatisticas:

```typescript
atDepot: vehicles.filter(v => isAtDepot(v)).length,
```

### 3. Novo tipo em `FilterTab`
Estender o union type para incluir `"at_depot"`:

```typescript
type FilterTab = "all" | "moving" | "stopped" | "alerts" | "at_store" | "at_supplier" | "at_depot";
```

### 4. Novo filtro na lista `filtered`
Adicionar condicao para o novo tab:

```typescript
if (filterTab === "at_depot") return isAtDepot(v);
```

### 5. Novo widget card
Adicionar entrada no array `widgetCards` com icone `Warehouse` (ja importado):

```typescript
{ label: "Entreposto", value: stats.atDepot, icon: Warehouse, variant: "default", action: () => setFilterTab("at_depot") },
```

### 6. Novo tab
Adicionar entrada no array `tabs`:

```typescript
{ key: "at_depot", label: "Entreposto" },
```

### 7. Mapeamento do tab count
A linha 761 ja usa o fallback `tab.key as keyof typeof stats`, mas precisamos garantir que `"at_depot"` mapeia para `"atDepot"`. Adicionar caso explicito:

```typescript
tab.key === "at_depot" ? "atDepot"
```

## Impacto
- Novo widget clicavel no topo do Dashboard para veiculos em entrepostos/centros de distribuicao
- Novo tab na barra de filtros com contagem correta
- Filtragem funcional na lista de veiculos e no mapa
- Sem alteracoes na base de dados

