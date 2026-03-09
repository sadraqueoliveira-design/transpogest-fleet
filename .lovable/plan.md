

# Corrigir campos de validade por tipo de documento

## Problema
- Certificado ATP só precisa de mês e ano (não dia completo)
- Livrete não precisa de data de validade

## Alterações

### `DriverDocuments.tsx` e `Fleet.tsx`
- Condicionar o campo de validade ao tipo de documento selecionado:
  - `vehicle_registration` (Livrete): esconder o campo de validade
  - `atp_certificate` (Certificado ATP): usar `input type="month"` (mês/ano)
  - Todos os outros: manter `input type="date"` normal
- Quando `atp_certificate` é selecionado e o utilizador escolhe mês/ano (ex: `2026-03`), guardar como último dia do mês (`2026-03-31`) para a lógica de expiração funcionar corretamente
- Na exibição (`ExpiryBadge`), quando o `doc_type` é `atp_certificate`, mostrar apenas mês/ano (ex: `03/2026`) em vez de `dd/MM/yyyy`

### Ficheiros alterados
- `src/pages/driver/DriverDocuments.tsx`
- `src/pages/admin/Fleet.tsx`

Sem alterações de base de dados — o campo `expiry_date` já suporta `null` e datas parciais (armazenadas como último dia do mês).

