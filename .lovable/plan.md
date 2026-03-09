

# Correção: Matrículas e MOVEL não encontrados

## Diagnóstico (dos logs da consola)

A planilha tem uma **estrutura dividida**:
- **Coluna 0**: contém labels como "Móvel" (e provavelmente "MATRICULAS")
- **Coluna 6**: contém as categorias de manutenção (IPO, Revisão KM, etc.)

O código deteta a **coluna 6** como `labelCol` (tem mais hits). Depois procura MATRICULAS e MOVEL **apenas na coluna 6** — mas esses labels estão na **coluna 0**. Por isso:
- A linha de matrículas não é encontrada pelo label → cai no fallback por padrão de matrícula
- O fallback procura matrículas a partir de `labelCol + 1` (coluna 7), perdendo as matrículas entre col 1 e col 5
- A linha MOVEL nunca é encontrada (procurada só na col 6)
- A linha MOTORISTA também não

## Correção

**Ficheiro**: `src/components/admin/MaintenanceImportExport.tsx`

1. **MATRICULAS**: Procurar o label "MATRICULAS" em **todas as colunas** (não só na `labelCol`)
2. **MOVEL**: Procurar "MOVEL"/"MÓVEL" em **todas as colunas** (não só na `labelCol`)  
3. **MOTORISTA**: Procurar em **todas as colunas**
4. **Fallback de matrículas**: Quando usar o fallback por padrão de placa, iniciar a busca na **coluna 0** (não em `labelCol + 1`)
5. **Extração de matrículas**: Ao extrair as placas da platesRow, começar da coluna onde as placas realmente começam (detetar dinamicamente)

Estas são alterações cirúrgicas nas funções `parseTransposedFile` — ~30 linhas afetadas.

