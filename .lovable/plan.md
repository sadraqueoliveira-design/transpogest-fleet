
## Historico Diario de Insercao/Retirada de Cartao

### Problema
Atualmente, o sistema so guarda o ultimo `card_inserted_at` na tabela `vehicles`. Nao existe historico de insercoes e retiradas, impossibilitando consultar quem usou que veiculo ao longo do dia.

### Solucao

#### 1. Nova tabela `card_events` (migracao SQL)

Tabela para registar cada evento de insercao/retirada:

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid PK | Identificador |
| vehicle_id | uuid | Referencia ao veiculo |
| plate | text | Matricula (para consulta rapida) |
| card_number | text | Numero do cartao |
| driver_name | text | Nome do motorista (da tachograph_cards) |
| employee_number | integer | Numero de funcionario (da employees) |
| event_type | text | `inserted` ou `removed` |
| event_at | timestamptz | Hora do evento (de Event 45 ou tmx) |
| created_at | timestamptz | Hora do registo |

RLS: admins/managers podem ler e gerir; drivers podem ler os proprios.

#### 2. Atualizar Edge Function `sync-trackit-data`

Na logica existente de tracking de cartao (onde ja deteta insercoes, remocoes e trocas), adicionar escrita na tabela `card_events`:

- Quando `!oldHasCard && newHasCard` (insercao): inserir evento `inserted`
- Quando `oldHasCard && !newHasCard` (remocao): inserir evento `removed`  
- Quando cartao muda (troca de motorista): inserir `removed` para o antigo + `inserted` para o novo
- Enriquecer com `driver_name` e `employee_number` cruzando com `tachograph_cards` e `employees`

#### 3. Nova pagina `CardHistory` em `/admin/historico-cartoes`

Interface com:
- **Filtro por data** (date picker, default = hoje)
- **Pesquisa por nome do motorista ou numero de funcionario**
- **Filtro por matricula** (select com lista de viaturas)
- **Tabela de resultados** com colunas: Hora, Evento (Inserido/Retirado), Motorista, N. Funcionario, Matricula
- Ordenacao cronologica (mais recente primeiro)
- Badge colorido para tipo de evento (verde=inserido, vermelho=retirado)

#### 4. Adicionar rota e link no menu

- Nova rota `/admin/historico-cartoes` no `App.tsx`
- Novo item no menu lateral do `AdminLayout.tsx` (icone `History`, label "Hist. Cartoes")

### Secao Tecnica

**Ficheiros a criar:**
- `src/pages/admin/CardHistory.tsx` -- pagina principal

**Ficheiros a modificar:**
- `supabase/functions/sync-trackit-data/index.ts` -- registar eventos na nova tabela
- `src/App.tsx` -- adicionar rota
- `src/components/layouts/AdminLayout.tsx` -- adicionar item no menu

**Migracao SQL:**
```sql
CREATE TABLE public.card_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id),
  plate text NOT NULL,
  card_number text,
  driver_name text,
  employee_number integer,
  event_type text NOT NULL CHECK (event_type IN ('inserted', 'removed')),
  event_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_events_event_at ON public.card_events(event_at DESC);
CREATE INDEX idx_card_events_plate ON public.card_events(plate);
CREATE INDEX idx_card_events_card_number ON public.card_events(card_number);

ALTER TABLE public.card_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager can manage card events"
  ON public.card_events FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Authenticated can read card events"
  ON public.card_events FOR SELECT
  USING (true);
```
