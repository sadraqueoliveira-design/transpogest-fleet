

# Atualizar dados de manutenção com a nova planilha

## Resumo

A planilha contém dados atualizados para **41 viaturas** (excluindo reboques L-*) nas 8 categorias de manutenção. O plano é limpar os registos existentes e inserir os novos valores extraídos da planilha.

## Dados extraídos da planilha

Categorias e respetivas linhas:
- **Revisão KM**: data próxima revisão + KM próxima revisão
- **Revisão Anual**: data próxima revisão anual
- **IPO**: data IPO
- **Revisão Frio**: data próxima revisão frio
- **Revisão Horas**: horas próxima revisão (quando não é "Anual")
- **Tacógrafo**: data tacógrafo
- **ATP**: data ATP
- **Lavagem**: última data de lavagem (guardada como `last_service_date`)

## Implementação

1. **Apagar registos existentes** da tabela `vehicle_maintenance_schedule`
2. **Inserir ~280 registos** com os valores atualizados para todas as viaturas e categorias
3. **Sincronizar** `vehicles.inspection_expiry` e `vehicles.tachograph_calibration_date` com os valores de IPO e Tacógrafo

Dados novos vs anteriores (diferenças detetadas):
- Datas de revisão KM alteradas para várias viaturas (ex: 73-DH-27 mantém 4/17/27)
- KMs atualizados (ex: 91-DD-33 mantém 1,168,063)
- Revisão anual: 42-HX-65 passou de `1/2/26` para `11/6/26`
- IPO, Frio, Tacógrafo, ATP com datas atualizadas
- Novas viaturas de serviço (05-IC-31, 98-MO-17, 71-VD-89, BF-99-CD) com dados de lavagem

Ficheiros alterados: nenhum ficheiro de código — apenas operações SQL na base de dados.

