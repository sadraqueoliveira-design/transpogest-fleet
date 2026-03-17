

# Justificação de Ausências com Comprovativos

## Objetivo
Permitir que motoristas enviem justificações de ausência (baixa médica, seguro, falta) com upload de comprovativos (fotos/imagens) e que os administradores possam visualizar e aprovar/rejeitar com os anexos.

## Alterações necessárias

### 1. Base de dados
- Adicionar novos valores ao enum `request_type`: `Absence`, `SickLeave`, `Insurance`
- Adicionar coluna `attachments text[]` à tabela `service_requests` para guardar URLs dos ficheiros
- Criar política de storage no bucket existente ou criar bucket `request-attachments` (público) para os comprovativos

### 2. Página do motorista (`src/pages/driver/DriverRequests.tsx`)
- Adicionar novos tipos de pedido: "Falta", "Baixa Médica", "Seguro"
- Campos específicos por tipo: datas de início/fim, motivo
- Componente de upload de fotos/imagens (câmara ou galeria) com preview
- Upload dos ficheiros para o bucket antes de submeter o pedido
- Guardar as URLs no campo `attachments` do `details` JSON (evita alteração de schema se preferirmos usar o campo `details` existente)

**Alternativa mais simples (sem migração de schema):** Guardar as URLs dos attachments dentro do campo `details` JSONB existente como `details.attachments: string[]`. Isto evita adicionar colunas e enum values.

### 3. Página admin (`src/pages/admin/ServiceRequests.tsx`)
- Mostrar os novos tipos traduzidos no `typeMap`
- Renderizar os detalhes de forma legível (datas, motivo) em vez de `JSON.stringify`
- Mostrar thumbnails/links dos comprovativos anexados
- Permitir clicar para ver imagem em tamanho completo (dialog)

### Abordagem recomendada
Usar o campo `details` JSONB existente para guardar tudo (datas, motivo, URLs de attachments). Isto evita migrações de enum e schema. Os novos tipos de ausência serão valores do enum existente, que precisa de ser expandido.

### Ficheiros a alterar
- **Migração SQL**: expandir enum `request_type` + criar bucket `request-attachments`
- **`src/pages/driver/DriverRequests.tsx`**: adicionar tipos de ausência, upload de fotos, preview
- **`src/pages/admin/ServiceRequests.tsx`**: renderizar detalhes formatados e thumbnails dos comprovativos

